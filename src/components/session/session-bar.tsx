"use client";

import { History, Plus, Radio, Square, Timer } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ANNOUNCE_SESSION_EVENT, SESSION_CHANGED_EVENT } from "@/components/collab/use-collab";
import { FormError } from "@/components/form-error";
import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  endSession,
  extendSession,
  getLiveSession,
  joinSession,
  startSession,
  type LiveSession,
} from "@/lib/session-actions";
import { cn } from "@/lib/utils";

/** Tell everyone else on the page that the session changed, and (unless `local` is false) this tab's banner. */
function announce(pageId: string, local = true) {
  window.dispatchEvent(new Event(ANNOUNCE_SESSION_EVENT));
  if (local) window.dispatchEvent(new CustomEvent(SESSION_CHANGED_EVENT, { detail: { pageId } }));
}

/** "Session ▾" in the page header: start one, or look at past ones. */
export function SessionMenu({
  pageId,
  sessionsHref,
  canStart,
}: {
  pageId: string;
  sessionsHref: string;
  canStart: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("Working session");
  const [minutes, setMinutes] = useState("25");
  const [goal, setGoal] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function start(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await startSession(pageId, { title, goal, minutes: Number(minutes) });
      if (!result.ok) return setError(result.error);
      setOpen(false);
      setError(undefined);
      announce(pageId);
      toast.success(`“${title.trim()}” is live`, { description: "Everyone in the workspace got a heads-up." });
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <Radio aria-hidden="true" /> Session
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canStart && (
            <DropdownMenuItem onSelect={() => setOpen(true)}>
              <Timer aria-hidden="true" /> Start a live session…
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <Link href={sessionsHref}>
              <History aria-hidden="true" /> Past sessions
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={start} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Start a live session</DialogTitle>
              <DialogDescription>
                A timed block to work on this page together. Everyone here sees the timer, and when it ends Braid writes
                a recap of who changed what.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Label htmlFor="session-title">Name</Label>
              <Input id="session-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="session-length">Length</Label>
              <Select value={minutes} onValueChange={setMinutes}>
                <SelectTrigger id="session-length" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["15", "25", "45", "60", "90"].map((m) => (
                    <SelectItem key={m} value={m}>
                      {m} minutes
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="session-goal">Goal (optional)</Label>
              <Input
                id="session-goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g. Agree the launch plan"
                maxLength={200}
              />
            </div>
            <FormError message={error} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="brand" disabled={pending || !title.trim()}>
                {pending ? "Starting…" : "Start session"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The current time, ticking once a second. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function clock(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * The live-session banner under a page's header. Hidden when there's no
 * session. Updates the moment anyone starts, joins, extends or ends one
 * (and checks every 30 seconds in case a message was missed).
 */
export function SessionBar({
  pageId,
  initial,
  meId,
  canManage,
  sessionsHref,
}: {
  pageId: string;
  initial: LiveSession | null;
  meId: string;
  canManage: boolean;
  sessionsHref: string;
}) {
  const router = useRouter();
  const [session, setSession] = useState(initial);
  const current = useRef(initial);
  const [pending, startTransition] = useTransition();
  const now = useNow();

  const refresh = useCallback(async () => {
    const next = await getLiveSession(pageId).catch(() => undefined);
    if (next === undefined) return;
    const prev = current.current;
    if (prev && !next) {
      toast(`“${prev.title}” has ended`, {
        id: `session-ended-${prev.id}`,
        action: { label: "See recap", onClick: () => router.push(`${sessionsHref}/${prev.id}`) },
      });
    }
    current.current = next;
    setSession(next);
  }, [pageId, router, sessionsHref]);

  useEffect(() => {
    const onChanged = (event: Event) => {
      if ((event as CustomEvent<{ pageId: string }>).detail?.pageId === pageId) void refresh();
    };
    window.addEventListener(SESSION_CHANGED_EVENT, onChanged);
    const poll = setInterval(() => document.visibilityState === "visible" && void refresh(), 30_000);
    return () => {
      window.removeEventListener(SESSION_CHANGED_EVENT, onChanged);
      clearInterval(poll);
    };
  }, [pageId, refresh]);

  if (!session) return null;
  // Capped at the session's length, in case this computer's clock is a little behind the server's.
  const left = Math.min(session.endsAt - now, session.endsAt - session.startedAt);
  const over = left <= 0;
  const joined = session.participants.some((p) => p.id === meId);
  const shown = session.participants.slice(0, 5);

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, done?: () => void, local = true) =>
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) return void toast.error("Couldn't update the session", { description: result.error });
      announce(pageId, local);
      done?.();
    });

  return (
    <section
      aria-label="Live session"
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-6 py-2.5 text-sm",
        over ? "bg-amber-50" : "bg-red-50/70",
      )}
    >
      <span className="flex items-center gap-2 font-semibold text-red-700">
        <span className="relative flex size-2.5" aria-hidden="true">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-60" />
          <span className="relative inline-flex size-2.5 rounded-full bg-red-600" />
        </span>
        Live
      </span>
      <span className="min-w-0">
        <span className="font-medium">{session.title}</span>
        {session.goal && <span className="text-muted-foreground"> · {session.goal}</span>}
      </span>
      <span
        role="timer"
        aria-label={over ? "Time's up" : `${clock(left)} left`}
        className={cn(
          "rounded-md px-2 py-0.5 font-mono text-[13px] tabular-nums",
          over ? "bg-amber-200 text-amber-950" : "bg-white text-foreground",
        )}
      >
        {over ? "Time's up" : `${clock(left)} left`}
      </span>
      <span className="flex items-center" aria-label={`${session.participants.length} in this session`}>
        {shown.map((p) => (
          <MemberAvatar key={p.id} name={p.name} color={p.color} className="-ml-1.5 size-7 ring-2 ring-white first:ml-0" />
        ))}
        {session.participants.length > shown.length && (
          <span className="ml-1 text-xs text-muted-foreground">+{session.participants.length - shown.length}</span>
        )}
      </span>
      <span className="ml-auto flex items-center gap-1.5">
        {!joined && (
          <Button size="sm" variant="brand" disabled={pending} onClick={() => act(() => joinSession(session.id))}>
            Join
          </Button>
        )}
        {canManage && (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => act(() => extendSession(session.id, 5), () => toast.success("5 more minutes"))}
            >
              <Plus aria-hidden="true" /> 5 min
            </Button>
            <Button
              size="sm"
              variant={over ? "brand" : "outline"}
              disabled={pending}
              onClick={() =>
                act(
                  () => endSession(session.id),
                  () => {
                    current.current = null;
                    setSession(null);
                    toast.success(`“${session.title}” ended`, { description: "Here's what happened." });
                    router.push(`${sessionsHref}/${session.id}`);
                  },
                  false,
                )
              }
            >
              <Square aria-hidden="true" /> End session
            </Button>
          </>
        )}
      </span>
    </section>
  );
}
