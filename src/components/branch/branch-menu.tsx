"use client";

import { GitBranch, GitBranchPlus, List } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/form-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBranch } from "@/lib/branch-actions";
import { timeAgo } from "@/lib/utils";

export type OpenBranch = { id: string; name: string; authorName: string; updatedAt: Date };

/** The "Branches" button in a page's header: open branches, and "New branch". */
export function BranchMenu({
  slug,
  pageId,
  pageTitle,
  branches,
  canCreate,
}: {
  slug: string;
  pageId: string;
  pageTitle: string;
  branches: OpenBranch[];
  canCreate: boolean;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <GitBranch aria-hidden="true" /> Branches
            {branches.length > 0 && (
              <Badge variant="secondary" className="px-1.5 py-0 text-xs">
                {branches.length}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>Open branches</DropdownMenuLabel>
          {branches.length === 0 ? (
            <p className="px-2 pb-2 text-sm text-muted-foreground">
              None yet. A branch is a private copy you can edit, then review and merge back.
            </p>
          ) : (
            branches.map((b) => (
              <DropdownMenuItem key={b.id} asChild>
                <Link href={`/w/${slug}/p/${pageId}/b/${b.id}`} className="flex flex-col items-start gap-0">
                  <span className="font-medium">{b.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {b.authorName} · edited {timeAgo(b.updatedAt)}
                  </span>
                </Link>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          {canCreate && (
            <DropdownMenuItem onSelect={() => setCreating(true)}>
              <GitBranchPlus aria-hidden="true" /> New branch…
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <Link href={`/w/${slug}/p/${pageId}/branches`}>
              <List aria-hidden="true" /> All branches
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <NewBranchDialog open={creating} onOpenChange={setCreating} pageId={pageId} pageTitle={pageTitle} />
    </>
  );
}

export function NewBranchDialog({
  open,
  onOpenChange,
  pageId,
  pageTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageId: string;
  pageTitle: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createBranch(pageId, name);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
      setName("");
      setError(null);
      toast.success(`Branch “${name.trim()}” created`, {
        description: "Edit freely: nothing changes on the page until you merge.",
      });
      router.push(result.url);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>New branch</DialogTitle>
            <DialogDescription>
              A copy of “{pageTitle}” that you and others can edit on its own. When it&apos;s ready, review the
              changes and merge them back.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="branch-name">Branch name</Label>
            <Input
              id="branch-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rewrite the intro"
              maxLength={80}
              autoFocus
              aria-invalid={Boolean(error)}
            />
            <FormError message={error ?? undefined} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="brand" disabled={pending || !name.trim()}>
              {pending ? "Creating…" : "Create branch"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A "New branch" button that opens the same dialog. */
export function NewBranchButton({ pageId, pageTitle }: { pageId: string; pageTitle: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="brand" size="sm" onClick={() => setOpen(true)}>
        <GitBranchPlus aria-hidden="true" /> New branch
      </Button>
      <NewBranchDialog open={open} onOpenChange={setOpen} pageId={pageId} pageTitle={pageTitle} />
    </>
  );
}
