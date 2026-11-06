import { Logo } from "@/components/logo";
import { WorkspaceForm } from "./workspace-form";

export const metadata = { title: "Create workspace" };

export default function OnboardingPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="flex w-full max-w-md flex-col gap-7">
        <Logo href="/app" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Create your workspace</h1>
          <p className="mt-2 text-muted-foreground">Step 2 of 2 · a home for your team&apos;s boards and docs</p>
        </div>
        <WorkspaceForm />
      </div>
    </main>
  );
}
