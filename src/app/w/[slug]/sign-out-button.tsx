"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="Sign out"
      title="Sign out"
      className="grid size-9 place-items-center rounded-lg text-muted hover:bg-zinc-100 hover:text-ink"
      onClick={async () => {
        await authClient.signOut();
        router.push("/");
        router.refresh();
      }}
    >
      <LogOut className="size-4" aria-hidden="true" />
    </button>
  );
}
