import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-20 text-center">
      <LogoMark size={40} />
      <h1 className="text-2xl font-bold">We couldn&apos;t find that</h1>
      <p className="max-w-sm text-muted">
        The page may have been deleted, or you might not be a member of this workspace.
      </p>
      <Link href="/app" className={buttonClass("primary")}>
        Back to my workspace
      </Link>
    </main>
  );
}
