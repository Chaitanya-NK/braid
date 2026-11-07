"use client";

import { Headphones, Mic, MicOff, MonitorUp, PhoneOff, Video, VideoOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { usePageCollab } from "@/components/collab/page-collab-store";
import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { huddleFor, type Huddle, type HuddleAwareness, type HuddleSnapshot } from "./huddle-engine";

function useHuddle(pageId: string): { huddle: Huddle | null; snap: HuddleSnapshot | null } {
  const collab = usePageCollab(pageId);
  const huddle = useMemo(() => (collab ? huddleFor(collab.provider) : null), [collab]);
  const snap = useSyncExternalStore(
    huddle?.subscribe ?? noopSubscribe,
    huddle?.getSnapshot ?? nullSnapshot,
    nullSnapshot,
  );
  return { huddle, snap };
}
const noopSubscribe = () => () => {};
const nullSnapshot = () => null;

/** Names of everyone in this page's huddle (whether or not I've joined). */
function useHuddleRoster(pageId: string) {
  const collab = usePageCollab(pageId);
  const roster = useSyncExternalStore(
    (notify) => {
      const awareness = collab?.provider.awareness;
      awareness?.on("change", notify);
      return () => awareness?.off("change", notify);
    },
    () => {
      const awareness = collab?.provider.awareness;
      if (!awareness) return "[]";
      const people: { name: string; color: string; me: boolean }[] = [];
      awareness.getStates().forEach((s, id) => {
        if ((s.huddle as HuddleAwareness | null)?.peerId) {
          people.push({ name: String(s.user?.name ?? "Someone"), color: String(s.user?.color ?? "#71717a"), me: id === awareness.clientID });
        }
      });
      return JSON.stringify(people);
    },
    () => "[]",
  );
  return useMemo(() => JSON.parse(roster) as { name: string; color: string; me: boolean }[], [roster]);
}

/** "Huddle" in the page header: join, or see who's talking. */
export function HuddleButton({ pageId }: { pageId: string }) {
  const { huddle, snap } = useHuddle(pageId);
  const roster = useHuddleRoster(pageId);
  const others = roster.filter((p) => !p.me);
  if (snap?.joined) {
    return (
      <Button variant="ghost" size="sm" className="text-brand-strong" disabled>
        <Headphones aria-hidden="true" /> In huddle
      </Button>
    );
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={!huddle || snap?.joining}
      onClick={() => huddle?.join().then(() => {
        if (huddle.getSnapshot().listenOnly) {
          toast.warning("Joined without a microphone", {
            description: "Your browser didn't share one, so you can listen but not talk.",
          });
        }
      })}
      aria-label={others.length ? `Join huddle with ${others.map((p) => p.name).join(", ")}` : "Start a huddle"}
    >
      <Headphones aria-hidden="true" />
      {snap?.joining ? "Joining…" : others.length ? "Join huddle" : "Huddle"}
      {others.length > 0 && (
        <span className="flex -space-x-1.5">
          {others.slice(0, 3).map((p, i) => (
            <MemberAvatar key={i} name={p.name} color={p.color} className="size-5 text-[9px] ring-2 ring-background" />
          ))}
        </span>
      )}
    </Button>
  );
}

/** Is there sound on this stream right now? Checked a few times a second. */
function useSpeaking(stream: MediaStream | null, enabled: boolean) {
  const [speaking, setSpeaking] = useState(false);
  const audioTracks = stream?.getAudioTracks().length ?? 0;
  useEffect(() => {
    if (!stream || !enabled || audioTracks === 0) return;
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let lastLoud = 0;
    const id = setInterval(() => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += (v - 128) ** 2;
      if (Math.sqrt(sum / data.length) > 4) lastLoud = Date.now();
      // Hold for a moment after the last sound, so the ring doesn't flicker between words.
      setSpeaking(Date.now() - lastLoud < 600);
    }, 150);
    return () => {
      clearInterval(id);
      setSpeaking(false);
      void ctx.close();
    };
  }, [stream, enabled, audioTracks]);
  return enabled && speaking;
}

function VideoView({ stream, mirror }: { stream: MediaStream; mirror?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <video ref={ref} autoPlay playsInline muted className={cn("size-full object-cover", mirror && "-scale-x-100")} />
  );
}

function RemoteAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  return <audio ref={ref} autoPlay />;
}

function Tile({
  name,
  you = false,
  color,
  stream,
  muted,
  video,
  status,
  mirror,
}: {
  name: string;
  you?: boolean;
  color: string;
  stream: MediaStream | null;
  muted: boolean;
  video: HuddleAwareness["video"];
  status?: string;
  mirror?: boolean;
}) {
  const speaking = useSpeaking(stream, !muted);
  const label = you ? `${name} (you)` : name;
  const showVideo = video !== "off" && stream && stream.getVideoTracks().length > 0;
  return (
    <li
      aria-label={`${label}${muted ? ", muted" : ""}${speaking ? ", speaking" : ""}${status ? `, ${status}` : ""}`}
      className={cn(
        "relative grid aspect-video place-items-center overflow-hidden rounded-lg bg-zinc-900 ring-2 transition-shadow",
        speaking ? "ring-emerald-400" : "ring-transparent",
      )}
    >
      {showVideo ? (
        <VideoView stream={stream} mirror={mirror && video === "camera"} />
      ) : (
        <MemberAvatar name={name} color={color} className="size-11 text-sm" />
      )}
      <span className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">
        {muted && <MicOff className="size-3" aria-hidden="true" />}
        {label}
        {video === "screen" && <MonitorUp className="size-3" aria-hidden="true" />}
      </span>
      {status && (
        <span className="absolute top-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">{status}</span>
      )}
    </li>
  );
}

function Control({
  label,
  onClick,
  active,
  danger,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant={danger ? "destructive" : "outline"}
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          onClick={onClick}
          className={cn("rounded-full", active && "border-brand bg-brand-soft text-brand-strong")}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

const STATUS: Partial<Record<RTCPeerConnectionState | "new", string>> = {
  new: "Connecting…",
  connecting: "Connecting…",
  disconnected: "Reconnecting…",
  failed: "Couldn't connect",
};

/** The floating huddle panel, shown while you're in the huddle. Leaving the page leaves the huddle. */
export function HuddlePanel({ pageId, me }: { pageId: string; me: { name: string; color: string } }) {
  const { huddle, snap } = useHuddle(pageId);

  useEffect(() => () => huddle?.leave(), [huddle]);

  if (!huddle || !snap?.joined) return null;
  const run = (fn: () => Promise<void>, what: string) =>
    fn().catch(() => toast.error(`Couldn't ${what}`, { description: "Your browser didn't allow it." }));
  const failed = snap.peers.some((p) => p.state === "failed");

  return (
    <TooltipProvider>
      <section
        aria-label="Huddle"
        className="fixed right-4 bottom-4 z-40 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-3 rounded-2xl border bg-card p-3 shadow-xl"
      >
        <header className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Headphones className="size-4 text-brand" aria-hidden="true" /> Huddle
            <span className="font-normal text-muted-foreground">· {snap.peers.length + 1} here</span>
          </span>
          {snap.listenOnly && <span className="text-xs text-muted-foreground">Listening only</span>}
        </header>
        <ul aria-label="People in the huddle" className="grid grid-cols-2 gap-2">
          <Tile
            name={me.name}
            you
            color={me.color}
            stream={snap.localStream}
            muted={snap.muted}
            video={snap.video}
            mirror
          />
          {snap.peers.map((p) => (
            <Tile
              key={p.peerId}
              name={p.name}
              color={p.color}
              stream={p.stream}
              muted={p.muted}
              video={p.video}
              status={STATUS[p.state]}
            />
          ))}
        </ul>
        {snap.peers.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Waiting for others. Anyone on this page can see the huddle and join.
          </p>
        )}
        {failed && (
          <p className="text-xs text-muted-foreground">
            Some networks block direct calls, and Braid doesn&apos;t use a paid relay. Try another network.
          </p>
        )}
        <div className="flex items-center justify-center gap-2">
          <Control
            label={snap.muted ? "Unmute" : "Mute"}
            active={!snap.muted}
            disabled={snap.listenOnly}
            onClick={() => huddle.setMuted(!snap.muted)}
          >
            {snap.muted ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}
          </Control>
          <Control
            label={snap.video === "camera" ? "Turn camera off" : "Turn camera on"}
            active={snap.video === "camera"}
            onClick={() => run(() => huddle.setCamera(snap.video !== "camera"), "turn on your camera")}
          >
            {snap.video === "camera" ? <Video aria-hidden="true" /> : <VideoOff aria-hidden="true" />}
          </Control>
          <Control
            label={snap.video === "screen" ? "Stop sharing" : "Share screen"}
            active={snap.video === "screen"}
            onClick={() => run(() => huddle.setScreen(snap.video !== "screen"), "share your screen")}
          >
            <MonitorUp aria-hidden="true" />
          </Control>
          <Control label="Leave huddle" danger onClick={() => huddle.leave()}>
            <PhoneOff aria-hidden="true" />
          </Control>
        </div>
        {snap.peers.map((p) => (
          <RemoteAudio key={p.peerId} stream={p.stream} />
        ))}
      </section>
    </TooltipProvider>
  );
}
