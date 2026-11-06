import Link from "next/link";
import { Suspense } from "react";
import { GitBranch, History, Mic, Shapes, SquareKanban, Timer, WifiOff } from "lucide-react";
import { Logo } from "@/components/logo";
import { SignedOutToast } from "@/components/signed-out-toast";
import { Button } from "@/components/ui/button";

const features = [
  { icon: SquareKanban, title: "Live boards & docs", body: "Edit together with live cursors. Every keystroke syncs.", phase: 1 },
  { icon: WifiOff, title: "Offline-first", body: "Keep working on a train. Changes merge when you reconnect.", phase: 3 },
  { icon: History, title: "Rewind", body: "Replay any page like a video and restore any moment.", phase: 4 },
  { icon: GitBranch, title: "Branches", body: "Fork a page, try an idea, review it, merge it back.", phase: 5 },
  { icon: Timer, title: "Live sessions", body: "Timed retros with anonymous cards and dot voting.", phase: 7 },
  { icon: Mic, title: "Huddles", body: "Peer-to-peer voice and Follow mode, right on the page.", phase: 8 },
  { icon: Shapes, title: "Spatial canvas", body: "Boards, docs and stickies on one infinite canvas.", phase: 9 },
];

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <Suspense>
        <SignedOutToast />
      </Suspense>
      <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
        <Logo />
        <nav aria-label="Main" className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/sign-up">Start a workspace</Link>
          </Button>
        </nav>
      </header>

      <main className="flex-1">
        <section className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-6 pb-16 pt-20 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-card px-3 py-1.5 text-sm text-zinc-700">
            <span className="size-2 rounded-full bg-green-600" aria-hidden="true" />
            Open source · Self-hostable · Built in public
          </span>
          <h1 className="text-5xl font-bold leading-[1.02] tracking-tight sm:text-7xl">
            The multiplayer workspace with a <span className="text-brand">rewind</span> button.
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Boards, docs and an infinite canvas your team edits together. Branch any page to try an
            idea, replay how a plan came together, and talk in a huddle without leaving the page.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild variant="brand" size="lg">
              <Link href="/sign-up">Create a free workspace</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/sign-in">I have an account</Link>
            </Button>
          </div>
        </section>

        <section aria-labelledby="roadmap" className="mx-auto max-w-6xl px-6 pb-24">
          <h2 id="roadmap" className="mb-2 text-center text-3xl font-bold tracking-tight">
            What&apos;s coming, phase by phase
          </h2>
          <p className="mb-10 text-center text-muted-foreground">
            Braid is being built in the open. Each phase ships something you can use.
          </p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <li key={f.title} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-6">
                <div className="flex items-center justify-between">
                  <span className="grid size-10 place-items-center rounded-xl bg-brand-soft">
                    <f.icon className="size-5 text-brand" aria-hidden="true" />
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">Phase {f.phase}</span>
                </div>
                <h3 className="text-lg font-semibold">{f.title}</h3>
                <p className="leading-relaxed text-muted-foreground">{f.body}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-border px-6 py-7 text-center text-sm text-muted-foreground">
        Braid · MIT licensed · Built with Next.js, Yjs and Postgres
      </footer>
    </div>
  );
}
