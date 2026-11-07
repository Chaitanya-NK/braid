"use client";

import { ChevronFirst, ChevronLast, Link2, Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { useCollab, useSyncState } from "@/components/collab/use-collab";
import { MemberAvatar } from "@/components/member-avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getPageHistory } from "@/lib/history-actions";
import { chaptersOf, decodeHistory, Replayer, restoreInto, type Step } from "@/lib/rewind";
import { cn } from "@/lib/utils";
import type { Member } from "@/components/board/card-tile";
import { ReplayBoard, ReplayCanvas, ReplayDoc } from "./replay-views";

type Props = {
  pageId: string;
  kind: "doc" | "board" | "canvas";
  me: Member;
  members: Member[];
  canRestore: boolean;
  backHref: string;
  initialStepId: number | null;
};

const BRAID: Member = { id: "braid", name: "Braid", color: "#52525B" };

const fmtTime = (ms: number) =>
  new Date(ms).toLocaleString("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const fmtClock = (ms: number) =>
  new Date(ms).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", second: "2-digit" });

export function RewindPlayer(props: Props) {
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPageHistory(props.pageId).then((entries) => {
      if (cancelled) return;
      if (!entries) setFailed(true);
      else setSteps(decodeHistory(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [props.pageId]);

  if (failed)
    return <p className="p-10 text-muted-foreground">You don&apos;t have access to this page&apos;s history.</p>;
  if (!steps) {
    return (
      <div aria-busy="true" className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-10">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-5 w-2/3" />
      </div>
    );
  }
  if (steps.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 p-16 text-center">
        <RotateCcw className="size-8 text-muted-foreground" aria-hidden="true" />
        <p className="font-medium">No history yet</p>
        <p className="text-sm text-muted-foreground">
          Edit this page and come back. Every change is recorded from now on.
        </p>
      </div>
    );
  }
  return <Player {...props} steps={steps} />;
}

function Player({ pageId, kind, me, members, canRestore, backHref, initialStepId, steps }: Props & { steps: Step[] }) {
  const router = useRouter();
  const last = steps.length - 1;
  const [replayer] = useState(() => new Replayer(steps));
  // What's on screen: the replay doc at `index`. `gen` changes when the doc
  // object is replaced (rewinding), `version` on every step.
  const [view, setView] = useState(() => {
    const start = initialStepId
      ? Math.max(
          0,
          steps.findIndex((s) => s.id === initialStepId),
        )
      : last;
    replayer.seek(start);
    return { index: start, doc: replayer.doc, gen: 0, version: 0 };
  });
  const { index, doc, gen: docGen, version } = view;
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState("4");
  const [skipIdle, setSkipIdle] = useState(true);
  const [restoring, startRestore] = useTransition();

  function goTo(target: number) {
    const replaced = replayer.seek(target);
    setView((v) => ({
      index: replayer.cursor,
      doc: replayer.doc,
      gen: replaced ? v.gen + 1 : v.gen,
      version: v.version + 1,
    }));
  }
  function jump(target: number) {
    setPlaying(false);
    goTo(target);
  }

  const people = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const who = (id: string | null) => (id ? (people.get(id) ?? { id, name: "Former member", color: "#71717A" }) : BRAID);
  const chapters = useMemo(() => chaptersOf(steps), [steps]);
  const lanes = useMemo(() => {
    const ids = [...new Set(steps.map((s) => s.userId ?? "braid"))];
    return ids.map((id) => ({ member: id === "braid" ? BRAID : who(id), userId: id }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, people]);

  // Playback: step forward on a timer that follows the real gaps between edits.
  useEffect(() => {
    if (!playing || index >= last) return;
    const gap = steps[index + 1].at - steps[index].at;
    const base = skipIdle ? Math.min(gap, 600) : Math.min(gap, 4000);
    const delay = Math.max(40, base / Number(speed));
    const t = setTimeout(() => {
      goTo(index + 1);
      if (index + 1 >= last) setPlaying(false);
    }, delay);
    return () => clearTimeout(t);
    // goTo only touches state setters and the stable replayer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, index, last, speed, skipIdle, steps]);

  // A live connection to the page, used only for "Restore this moment".
  const live = useCollab(pageId, me.id, () => {});
  const liveState = useSyncState(live?.provider ?? null);

  const step = steps[index];
  const author = who(step.userId);

  function copyLink() {
    const url = new URL(window.location.href);
    url.searchParams.set("at", String(step.id));
    navigator.clipboard.writeText(url.toString()).then(
      () => toast.success("Link copied", { description: `Opens Rewind at ${fmtTime(step.at)}` }),
      () => toast.error("Couldn't copy the link"),
    );
  }

  function restore() {
    if (!live) return;
    startRestore(async () => {
      restoreInto(live.doc, replayer.doc, kind);
      // Wait until the server has the restored version before leaving.
      await new Promise<void>((resolve) => {
        const done = () => !live.provider.hasUnsyncedChanges;
        if (done()) return resolve();
        const check = () => {
          if (done()) {
            live.provider.off("unsyncedChanges", check);
            resolve();
          }
        };
        live.provider.on("unsyncedChanges", check);
      });
      toast.success(`Restored to ${fmtTime(step.at)}`, {
        description: "Changed your mind? Rewind again and pick a moment before the restore.",
      });
      router.push(backHref);
    });
  }

  return (
    <TooltipProvider>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-6 py-3">
          <div className="flex items-center gap-3">
            <MemberAvatar name={author.name} color={author.color} className="size-8" />
            <div>
              <div className="text-sm font-medium" aria-live="polite">
                {author.id === "braid" ? "Braid" : author.name} · {fmtTime(step.at)}
              </div>
              <div className="text-xs text-muted-foreground">
                Step {index + 1} of {steps.length}
                {index === last && " · latest"}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={copyLink}>
              <Link2 aria-hidden="true" /> Copy link to this moment
            </Button>
            {canRestore && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="brand"
                    size="sm"
                    disabled={index === last || !live || liveState !== "saved" || restoring}
                  >
                    <RotateCcw aria-hidden="true" />
                    {restoring ? "Restoring…" : "Restore this moment"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Restore to {fmtTime(step.at)}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      The page goes back to how it looked at this moment, for everyone. Nothing is lost: the current
                      version stays in Rewind, so you can restore it later.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={restore}>Restore</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-zinc-100/70 px-6 py-8">
          <div
            className={cn(
              "mx-auto rounded-xl border bg-card p-8 shadow-sm",
              kind === "doc" ? "max-w-3xl" : "max-w-none",
            )}
          >
            {kind === "doc" ? (
              <ReplayDoc key={docGen} doc={doc} />
            ) : kind === "board" ? (
              <ReplayBoard key={docGen} doc={doc} version={version} members={members} />
            ) : (
              <ReplayCanvas key={docGen} doc={doc} version={version} />
            )}
          </div>
        </div>

        <section aria-label="Playback" className="flex flex-col gap-3 border-t bg-card px-6 py-4">
          {chapters.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-medium text-muted-foreground">Sessions</span>
              {chapters.map((c, i) => {
                const active = index >= c.start && index <= c.end;
                return (
                  <Badge key={c.start} asChild variant={active ? "default" : "outline"}>
                    <button
                      type="button"
                      onClick={() => jump(c.end)}
                      aria-label={`Session ${i + 1}: ${fmtTime(c.at)}, ${c.edits} edits`}
                      className="h-7 cursor-pointer px-2.5"
                    >
                      {fmtTime(c.at)}
                    </button>
                  </Badge>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <IconButton label="First step" onClick={() => jump(0)} disabled={index === 0}>
                <ChevronFirst />
              </IconButton>
              <IconButton label="Previous step" onClick={() => jump(index - 1)} disabled={index === 0}>
                <SkipBack />
              </IconButton>
              <Button
                size="icon"
                variant="brand"
                className="size-11 rounded-full"
                aria-label={playing ? "Pause" : "Play"}
                onClick={() => {
                  if (!playing && index >= last) goTo(0);
                  setPlaying((p) => !p);
                }}
              >
                {playing ? <Pause /> : <Play />}
              </Button>
              <IconButton label="Next step" onClick={() => jump(index + 1)} disabled={index === last}>
                <SkipForward />
              </IconButton>
              <IconButton label="Latest" onClick={() => jump(last)} disabled={index === last}>
                <ChevronLast />
              </IconButton>
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              {lanes.map(({ member, userId }) => (
                <div
                  key={userId}
                  className="grid grid-cols-[88px_1fr] items-center gap-2 text-xs text-muted-foreground"
                >
                  <span className="truncate">{member.id === me.id ? "You" : member.name.split(" ")[0]}</span>
                  <div className="relative h-2 rounded-full bg-muted" aria-hidden="true">
                    {steps.map((s, i) =>
                      (s.userId ?? "braid") === userId ? (
                        <span
                          key={s.id}
                          className="absolute top-0 h-2 w-1 rounded-full"
                          style={{
                            left: `calc(${last === 0 ? 0 : (i / last) * 100}% - 2px)`,
                            background: member.color,
                          }}
                        />
                      ) : null,
                    )}
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-[88px_1fr] items-center gap-2">
                <span className="text-xs text-muted-foreground tabular-nums">{fmtClock(step.at)}</span>
                <Slider
                  aria-label="Position in history"
                  min={0}
                  max={last}
                  step={1}
                  value={[index]}
                  onValueChange={([v]) => jump(v)}
                />
              </div>
            </div>

            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={speed}
              onValueChange={(v) => v && setSpeed(v)}
              aria-label="Playback speed"
            >
              {["1", "4", "16"].map((s) => (
                <ToggleGroupItem key={s} value={s} aria-label={`${s}× speed`} className="px-2.5 font-mono text-xs">
                  {s}×
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="flex items-center gap-2">
            <Switch id="skip-idle" checked={skipIdle} onCheckedChange={setSkipIdle} />
            <Label htmlFor="skip-idle" className="text-xs font-normal text-muted-foreground">
              Skip pauses between edits
            </Label>
          </div>
        </section>
      </div>
    </TooltipProvider>
  );
}

function IconButton({
  label,
  children,
  ...props
}: { label: string; children: React.ReactNode } & React.ComponentProps<typeof Button>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
