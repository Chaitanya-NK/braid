import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { db, schema } from "@/db";
import { findInvite, getCurrentUser } from "@/lib/dal";
import { ROLE_INFO } from "@/lib/permissions";
import { and, eq } from "drizzle-orm";
import { AcceptInviteButton } from "./accept-button";

export const metadata = { title: "Join workspace" };

export default function InvitePage({ params }: PageProps<"/invite/[token]">) {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="flex w-full max-w-md flex-col gap-7">
        <Logo href="/" />
        <Suspense fallback={<Skeleton className="h-56 rounded-xl" aria-busy="true" />}>
          <Invite params={params} />
        </Suspense>
      </div>
    </main>
  );
}

async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Render per request: whether a link has expired depends on the time now.
  await connection();
  const [found, user] = await Promise.all([findInvite(token), getCurrentUser()]);

  if (!found) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">
            <h1>This invite doesn&apos;t work any more</h1>
          </CardTitle>
          <CardDescription>It may have expired or been revoked. Ask whoever sent it for a new link.</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild variant="outline">
            <Link href={user ? "/app" : "/"}>{user ? "Go to my workspaces" : "Go to Braid"}</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const { invite, workspace, inviter } = found;
  const next = `/invite/${token}`;
  const [already] = user
    ? await db
        .select({ role: schema.workspaceMember.role })
        .from(schema.workspaceMember)
        .where(and(eq(schema.workspaceMember.workspaceId, workspace.id), eq(schema.workspaceMember.userId, user.id)))
        .limit(1)
    : [];

  return (
    <Card>
      <CardHeader>
        <CardDescription>{inviter} invited you to</CardDescription>
        <CardTitle className="text-3xl tracking-tight">
          <h1>{workspace.name}</h1>
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        You&apos;ll join as <strong className="text-foreground">{ROLE_INFO[invite.role].label.toLowerCase()}</strong>:{" "}
        {ROLE_INFO[invite.role].description.toLowerCase()}.
      </CardContent>
      <CardFooter className="flex flex-col items-stretch gap-2">
        {!user ? (
          <>
            <Button asChild variant="brand" size="lg">
              <Link href={`/sign-up?next=${encodeURIComponent(next)}`}>Create an account to join</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href={`/sign-in?next=${encodeURIComponent(next)}`}>I already have an account</Link>
            </Button>
          </>
        ) : already ? (
          <>
            <p className="text-sm">You&apos;re already in this workspace.</p>
            <Button asChild variant="brand" size="lg">
              <Link href={`/w/${workspace.slug}`}>Open {workspace.name}</Link>
            </Button>
          </>
        ) : (
          <>
            <AcceptInviteButton token={token} workspace={workspace.name} />
            <p className="text-center text-xs text-muted-foreground">Signed in as {user.email}</p>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
