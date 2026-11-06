"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { deletePageForever, restorePage } from "@/lib/actions";

export function TrashRowActions({ pageId, title }: { pageId: string; title: string }) {
  const [pending, startTransition] = useTransition();

  function restore() {
    startTransition(async () => {
      const result = await restorePage(pageId);
      if (result.ok) toast.success(`“${title}” restored`);
      else toast.error("Couldn't restore", { description: result.error });
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deletePageForever(pageId);
      if (result.ok) toast.success(`“${title}” deleted for good`);
      else toast.error("Couldn't delete", { description: result.error });
    });
  }

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={restore} disabled={pending}>
        Restore
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" disabled={pending} className="text-destructive hover:text-destructive">
            Delete forever
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{title}” for good?</AlertDialogTitle>
            <AlertDialogDescription>
              This can&apos;t be undone. The page and everything in it will be removed for everyone in
              the workspace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className={buttonVariants({ variant: "destructive" })}>
              Delete forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
