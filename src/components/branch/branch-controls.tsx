"use client";

import { GitPullRequestClosed, MoreHorizontal, Pencil, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { ANNOUNCE_BRANCH_EVENT, BRANCH_STATUS_EVENT } from "@/components/collab/use-collab";
import { FormError } from "@/components/form-error";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { closeBranch, renameBranch, reopenBranch } from "@/lib/branch-actions";

/** "⋯" menu on an open branch: rename, close. */
export function BranchMenuActions({ branchId, name }: { branchId: string; name: string }) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [closing, setClosing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function rename(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await renameBranch(branchId, draft);
      if (!result.ok) return setError(result.error);
      setRenaming(false);
      toast.success("Branch renamed");
      router.refresh();
    });
  }

  function close() {
    startTransition(async () => {
      const result = await closeBranch(branchId);
      if (!result.ok) {
        toast.error("Couldn't close the branch", { description: result.error });
        return;
      }
      // Lock it for anyone else who has it open.
      window.dispatchEvent(new Event(ANNOUNCE_BRANCH_EVENT));
      toast(`Closed “${name}”`, {
        description: "Nothing was merged. You can reopen it any time.",
        action: {
          label: "Reopen",
          onClick: async () => {
            const undo = await reopenBranch(branchId);
            if (undo.ok) router.refresh();
          },
        },
      });
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Branch options">
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setRenaming(true)}>
            <Pencil aria-hidden="true" /> Rename branch
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setClosing(true)}>
            <GitPullRequestClosed aria-hidden="true" /> Close without merging
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={rename} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Rename branch</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Label htmlFor="rename-branch">Branch name</Label>
              <Input id="rename-branch" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={80} />
              <FormError message={error ?? undefined} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenaming(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="brand" disabled={pending || !draft.trim()}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={closing} onOpenChange={setClosing}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close “{name}” without merging?</AlertDialogTitle>
            <AlertDialogDescription>
              The page stays as it is. The branch becomes view-only for everyone, and you can reopen it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={close}>Close branch</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function ReopenBranchButton({ branchId }: { branchId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await reopenBranch(branchId);
          if (!result.ok) {
            toast.error("Couldn't reopen the branch", { description: result.error });
            return;
          }
          toast.success("Branch reopened");
          router.refresh();
        })
      }
    >
      <RotateCcw aria-hidden="true" /> Reopen branch
    </Button>
  );
}

/**
 * Keeps an open branch page honest: when someone else merges or closes the
 * branch, show a toast and re-render the page as view-only.
 */
export function BranchStatusWatcher({ branchId }: { branchId: string }) {
  const router = useRouter();
  useEffect(() => {
    const onStatus = (event: Event) => {
      const { branchId: id, status } = (event as CustomEvent<{ branchId: string; status: string }>).detail;
      if (id !== branchId) return;
      toast.info(status === "merged" ? "This branch was just merged into the page" : "This branch was just closed", {
        description: "It's view-only now.",
        id: `branch-status-${branchId}`,
      });
      router.refresh();
    };
    window.addEventListener(BRANCH_STATUS_EVENT, onStatus);
    return () => window.removeEventListener(BRANCH_STATUS_EVENT, onStatus);
  }, [branchId, router]);
  return null;
}
