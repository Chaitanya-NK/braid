import { Suspense } from "react";
import { OfflineBanner } from "@/components/offline-banner";
import { Sidebar, SidebarSkeleton } from "./sidebar";

export default function WorkspaceLayout({ children, params }: LayoutProps<"/w/[slug]">) {
  return (
    <div className="flex flex-1 flex-wrap">
      {/* The sidebar reads the session, so it streams in behind its own boundary. */}
      <Suspense fallback={<SidebarSkeleton />}>
        <Sidebar params={params} />
      </Suspense>
      <main className="min-w-0 flex-[999_1_560px]">
        <OfflineBanner />
        {children}
      </main>
    </div>
  );
}
