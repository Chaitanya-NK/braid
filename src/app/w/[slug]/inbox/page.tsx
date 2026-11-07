import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { listMembers, listNotifications, requireWorkspace } from "@/lib/dal";
import { InboxList } from "./inbox-list";

export const metadata = { title: "Inbox" };

export default function InboxPage({ params }: PageProps<"/w/[slug]/inbox">) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8 md:px-10">
      <Suspense fallback={<Skeleton className="h-72 rounded-xl" aria-busy="true" />}>
        <Inbox params={params} />
      </Suspense>
    </div>
  );
}

async function Inbox({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, workspace } = await requireWorkspace(slug);
  const [items, members] = await Promise.all([listNotifications(user.id, workspace.id), listMembers(workspace.id)]);
  const colors = Object.fromEntries(members.map((m) => [m.id, m.color]));
  return (
    <InboxList
      workspaceId={workspace.id}
      items={items.map((i) => ({
        ...i,
        createdAt: i.createdAt.getTime(),
        read: i.readAt !== null,
        actorColor: (i.actorId && colors[i.actorId]) || "#71717a",
      }))}
    />
  );
}
