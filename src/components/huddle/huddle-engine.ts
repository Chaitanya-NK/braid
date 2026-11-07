"use client";

import type { HocuspocusProvider } from "@hocuspocus/provider";

/**
 * A huddle: a drop-in voice (and optional video) call on a page, between
 * everyone who joins it. Browsers talk to each other directly with WebRTC,
 * so audio never goes through Braid's servers; the sync server only passes
 * the short setup messages between them.
 *
 * - Who's in the huddle lives in Yjs awareness (`huddle` field), so everyone
 *   on the page can see it and join.
 * - For each pair of people, the one with the larger peer id makes the
 *   offer. Two people joining at once never both offer to each other.
 * - Each connection has one audio and one video slot. Mute, camera and
 *   screen share swap what's in a slot, so no renegotiation is needed.
 * - STUN (free, Google's public server) finds a route between most networks.
 *   There's no TURN relay (that costs money), so a few strict networks
 *   can't connect; the UI says so.
 */

export type HuddleAwareness = {
  peerId: string;
  muted: boolean;
  video: "off" | "camera" | "screen";
};

export type RemotePeer = {
  peerId: string;
  clientId: number;
  userId: string | null;
  name: string;
  color: string;
  muted: boolean;
  video: HuddleAwareness["video"];
  state: RTCPeerConnectionState | "new";
  stream: MediaStream;
};

export type HuddleSnapshot = {
  joined: boolean;
  joining: boolean;
  muted: boolean;
  /** No microphone (refused or missing): listening only. */
  listenOnly: boolean;
  video: HuddleAwareness["video"];
  localStream: MediaStream | null;
  peers: RemotePeer[];
};

const ICE_SERVERS: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];

type Signal =
  | { type: "rtc"; from: string; to: string; kind: "hello" }
  | { type: "rtc"; from: string; to: string; kind: "description"; description: RTCSessionDescriptionInit }
  | { type: "rtc"; from: string; to: string; kind: "candidate"; candidate: RTCIceCandidateInit };

type Link = {
  pc: RTCPeerConnection;
  stream: MediaStream;
  pending: RTCIceCandidateInit[];
  offerer: boolean;
};

const IDLE: HuddleSnapshot = {
  joined: false,
  joining: false,
  muted: false,
  listenOnly: false,
  video: "off",
  localStream: null,
  peers: [],
};

export class Huddle {
  readonly peerId = crypto.randomUUID();
  private links = new Map<string, Link>();
  private mic: MediaStreamTrack | null = null;
  private videoTrack: MediaStreamTrack | null = null;
  private localStream: MediaStream | null = null;
  private snapshot: HuddleSnapshot = IDLE;
  private listeners = new Set<() => void>();
  private state = { joined: false, joining: false, muted: false, listenOnly: false, video: "off" as HuddleAwareness["video"] };

  constructor(private provider: HocuspocusProvider) {}

  /* ------------------------------ React plumbing ----------------------------- */

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => IDLE;

  private emit() {
    const awareness = this.provider.awareness;
    const peers: RemotePeer[] = [];
    awareness?.getStates().forEach((s, clientId) => {
      const h = s.huddle as HuddleAwareness | undefined;
      if (clientId === awareness.clientID || !h?.peerId) return;
      const link = this.links.get(h.peerId);
      peers.push({
        peerId: h.peerId,
        clientId,
        userId: (s.user?.id as string | undefined) ?? null,
        name: String(s.user?.name ?? "Someone"),
        color: String(s.user?.color ?? "#71717a"),
        muted: h.muted,
        video: h.video,
        state: link?.pc.connectionState ?? "new",
        stream: link?.stream ?? new MediaStream(),
      });
    });
    peers.sort((a, b) => a.clientId - b.clientId);
    this.snapshot = { ...this.state, localStream: this.localStream, peers };
    this.listeners.forEach((fn) => fn());
  }

  /* -------------------------------- Join / leave ------------------------------- */

  async join() {
    if (this.state.joined || this.state.joining) return;
    this.state.joining = true;
    this.emit();
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      this.mic = media.getAudioTracks()[0] ?? null;
    } catch {
      this.mic = null; // refused or no microphone: join to listen
    }
    this.localStream = new MediaStream(this.mic ? [this.mic] : []);
    this.state = { joined: true, joining: false, muted: !this.mic, listenOnly: !this.mic, video: "off" };
    this.provider.on("stateless", this.onStateless);
    // Tell the sync server which connection is ours before anyone sends us an offer,
    // and again after any reconnect.
    this.hello();
    this.provider.on("synced", this.hello);
    this.provider.awareness?.on("change", this.reconcile);
    this.publish();
    this.reconcile();
  }

  leave() {
    if (!this.state.joined) return;
    this.provider.off("stateless", this.onStateless);
    this.provider.off("synced", this.hello);
    this.provider.awareness?.off("change", this.reconcile);
    for (const peerId of [...this.links.keys()]) this.drop(peerId);
    this.mic?.stop();
    this.videoTrack?.stop();
    this.mic = this.videoTrack = this.localStream = null;
    this.lastRoster = "";
    this.provider.awareness?.setLocalStateField("huddle", null);
    this.state = { ...IDLE };
    this.emit();
  }

  private hello = () => {
    if (this.state.joined) this.send({ type: "rtc", from: this.peerId, to: this.peerId, kind: "hello" });
  };

  private publish() {
    const value: HuddleAwareness = { peerId: this.peerId, muted: this.state.muted, video: this.state.video };
    this.provider.awareness?.setLocalStateField("huddle", value);
  }

  /* ---------------------------------- Controls --------------------------------- */

  setMuted(muted: boolean) {
    if (!this.mic) return;
    this.mic.enabled = !muted;
    this.state.muted = muted;
    this.publish();
    this.emit();
  }

  /** Camera on/off. Throws if the camera can't be opened. */
  async setCamera(on: boolean) {
    if (on) {
      const media = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360 } });
      this.useVideo(media.getVideoTracks()[0], "camera");
    } else {
      this.useVideo(null, "off");
    }
  }

  /** Screen share on/off. Throws if the person cancels the picker. */
  async setScreen(on: boolean) {
    if (on) {
      const media = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = media.getVideoTracks()[0];
      // Stopping from the browser's own "Stop sharing" bar.
      track.addEventListener("ended", () => this.state.video === "screen" && this.useVideo(null, "off"));
      this.useVideo(track, "screen");
    } else {
      this.useVideo(null, "off");
    }
  }

  private useVideo(track: MediaStreamTrack | null, video: HuddleAwareness["video"]) {
    if (this.videoTrack && this.videoTrack !== track) this.videoTrack.stop();
    this.videoTrack = track;
    this.localStream = new MediaStream([...(this.mic ? [this.mic] : []), ...(track ? [track] : [])]);
    for (const link of this.links.values()) void this.videoSender(link.pc)?.replaceTrack(track);
    this.state.video = video;
    this.publish();
    this.emit();
  }

  private videoSender(pc: RTCPeerConnection) {
    return pc.getTransceivers().find((t) => t.receiver.track.kind === "video")?.sender;
  }

  /* ------------------------------ Connections ------------------------------ */

  private lastRoster = "";

  /** Connect to everyone in the huddle; drop anyone who left. */
  private reconcile = () => {
    if (!this.state.joined) return;
    const awareness = this.provider.awareness;
    // Awareness changes on every cursor move; only act when the huddle changed.
    const roster = JSON.stringify(
      [...(awareness?.getStates() ?? new Map())].map(([id, s]) => [id, s.huddle ?? null, s.user?.name ?? null]),
    );
    if (roster === this.lastRoster) return;
    this.lastRoster = roster;
    const present = new Set<string>();
    awareness?.getStates().forEach((s, clientId) => {
      const h = s.huddle as HuddleAwareness | undefined;
      if (clientId === awareness.clientID || !h?.peerId) return;
      present.add(h.peerId);
      if (!this.links.has(h.peerId) && this.peerId > h.peerId) void this.offer(h.peerId);
    });
    for (const peerId of [...this.links.keys()]) if (!present.has(peerId)) this.drop(peerId);
    this.emit();
  };

  private link(peerId: string, offerer: boolean): Link {
    const existing = this.links.get(peerId);
    if (existing) return existing;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const link: Link = { pc, stream: new MediaStream(), pending: [], offerer };
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.send({ type: "rtc", from: this.peerId, to: peerId, kind: "candidate", candidate: candidate.toJSON() });
    };
    pc.ontrack = ({ track }) => {
      link.stream.getTracks().filter((t) => t.kind === track.kind).forEach((t) => link.stream.removeTrack(t));
      link.stream.addTrack(track);
      this.emit();
    };
    pc.onconnectionstatechange = () => this.emit();
    this.links.set(peerId, link);
    return link;
  }

  private async offer(peerId: string) {
    const { pc } = this.link(peerId, true);
    const audio = pc.addTransceiver("audio", { direction: "sendrecv" });
    const video = pc.addTransceiver("video", { direction: "sendrecv" });
    await audio.sender.replaceTrack(this.mic);
    await video.sender.replaceTrack(this.videoTrack);
    await pc.setLocalDescription(await pc.createOffer());
    const sendOffer = () =>
      this.send({ type: "rtc", from: this.peerId, to: peerId, kind: "description", description: pc.localDescription!.toJSON() });
    sendOffer();
    // If the other side wasn't reachable yet, ask again a few times.
    for (const delay of [2000, 5000, 10000]) {
      setTimeout(() => {
        if (this.links.get(peerId)?.pc === pc && pc.signalingState === "have-local-offer") sendOffer();
      }, delay);
    }
  }

  private onStateless = ({ payload }: { payload: string }) => {
    let message: Signal;
    try {
      message = JSON.parse(payload);
    } catch {
      return;
    }
    if (message.type !== "rtc" || message.to !== this.peerId || message.kind === "hello") return;
    void this.handle(message).catch((error) => console.warn("Huddle signal failed", error));
  };

  private async handle(message: Signal) {
    if (message.kind === "description") {
      const { description } = message;
      if (description.type === "offer") {
        const link = this.link(message.from, false);
        if (link.pc.signalingState !== "stable" || link.pc.remoteDescription) return; // a repeat of an offer we answered
        await link.pc.setRemoteDescription(description);
        for (const t of link.pc.getTransceivers()) {
          t.direction = "sendrecv";
          await t.sender.replaceTrack(t.receiver.track.kind === "audio" ? this.mic : this.videoTrack);
        }
        await link.pc.setLocalDescription(await link.pc.createAnswer());
        this.send({
          type: "rtc",
          from: this.peerId,
          to: message.from,
          kind: "description",
          description: link.pc.localDescription!.toJSON(),
        });
        await this.flush(link);
      } else {
        const link = this.links.get(message.from);
        if (!link || link.pc.signalingState !== "have-local-offer") return;
        await link.pc.setRemoteDescription(description);
        await this.flush(link);
      }
    } else if (message.kind === "candidate") {
      const link = this.links.get(message.from) ?? this.link(message.from, false);
      if (link.pc.remoteDescription) await link.pc.addIceCandidate(message.candidate);
      else link.pending.push(message.candidate);
    }
  }

  private async flush(link: Link) {
    for (const candidate of link.pending.splice(0)) await link.pc.addIceCandidate(candidate).catch(() => {});
  }

  private drop(peerId: string) {
    const link = this.links.get(peerId);
    if (!link) return;
    link.pc.close();
    this.links.delete(peerId);
  }

  private send(signal: Signal) {
    this.provider.sendStateless(JSON.stringify(signal));
  }
}

/** One huddle per page connection, shared by the header button and the panel. */
const huddles = new WeakMap<HocuspocusProvider, Huddle>();
export function huddleFor(provider: HocuspocusProvider) {
  let huddle = huddles.get(provider);
  if (!huddle) {
    huddle = new Huddle(provider);
    huddles.set(provider, huddle);
  }
  return huddle;
}
