"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { acceptInvite } from "@/lib/member-actions";

export function AcceptInviteButton({ token, workspace }: { token: string; workspace: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="brand"
      size="lg"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await acceptInvite(token);
          if (!result.ok) {
            toast.error("Couldn't join", { description: result.error });
            return;
          }
          toast.success(`Welcome to ${result.workspace}!`);
          router.push(result.url);
        })
      }
    >
      {pending ? "Joining…" : `Join ${workspace}`}
    </Button>
  );
}
