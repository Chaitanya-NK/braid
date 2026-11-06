"use client";

import { Archive } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { archivePage, restorePage } from "@/lib/actions";

/** "Move to Trash" with an Undo button on the toast. */
export function MoveToTrashButton({ pageId, title }: { pageId: string; title: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function moveToTrash() {
    startTransition(async () => {
      const result = await archivePage(pageId);
      if (!result.ok) {
        toast.error("Couldn't move to Trash", { description: result.error });
        return;
      }
      const { slug } = result;
      router.push(`/w/${slug}`);
      toast(`“${title}” moved to Trash`, {
        action: {
          label: "Undo",
          onClick: async () => {
            const undo = await restorePage(pageId);
            if (!undo.ok) {
              toast.error("Couldn't restore", { description: undo.error });
              return;
            }
            toast.success(`“${title}” restored`);
            router.push(`/w/${slug}/p/${pageId}`);
          },
        },
      });
    });
  }

  return (
    <Button variant="ghost" size="sm" onClick={moveToTrash} disabled={pending}>
      <Archive aria-hidden="true" />
      {pending ? "Moving…" : "Move to Trash"}
    </Button>
  );
}
