import { redirect } from "next/navigation";
import { Suspense } from "react";
import { listMyWorkspaces, requireUser } from "@/lib/dal";

/** /app sends you to your first workspace, or to onboarding if you have none. */
export default function AppEntry() {
  return (
    <Suspense fallback={<p className="p-10 text-muted">Opening your workspace…</p>}>
      <Dispatch />
    </Suspense>
  );
}

async function Dispatch(): Promise<never> {
  const user = await requireUser();
  const workspaces = await listMyWorkspaces(user.id);
  redirect(workspaces.length ? `/w/${workspaces[0].slug}` : "/onboarding");
}
