"use client";

import { CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { markAllSeen } from "@/lib/catch-up-actions";

export function MarkAllSeenButton({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await markAllSeen(workspaceId);
          toast.success("All caught up");
          router.refresh();
        })
      }
    >
      <CheckCheck aria-hidden="true" /> Mark all as caught up
    </Button>
  );
}
