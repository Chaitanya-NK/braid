"use client";

import { ArrowLeft, GitMerge, RefreshCw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import * as Y from "yjs";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import { ReplayBoard, ReplayCanvas } from "@/components/rewind/replay-views";
import { diffCanvases } from "@/lib/canvas-model";
import { ANNOUNCE_BRANCH_EVENT, useCollab, useSyncState, type Collab } from "@/components/collab/use-collab";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { markBranchMerged, setBranchBase } from "@/lib/branch-actions";
import { diffBoards, diffDocs, docFromBase64, mergedPreview, toBase64 } from "@/lib/branch-diff";
import { BoardChangesView, DocDiffView } from "./diff-views";

type Member = { id: string; name: string; color: string };

type Props = {
  pageId: string;
  branchId: string;
  branchName: string;
  pageTitle: string;
  kind: "doc" | "board" | "canvas";
  /** The page as it was when the branch started (base64 Yjs update). */
  base: string | null;
  me: Member;
  members: Member[];
  canMerge: boolean;
  pageUrl: string;
  branchUrl: string;
};

const denied = () =>
  toast.error("Couldn't open this branch", {
    description: "You may no longer have access, or your session expired. Try reloading.",
    id: "branch-access",
  });

/**
 * Review a branch: what it changed, what the page will look like after
 * merging, and the merge itself. Both the page and the branch are opened
 * live, so the review stays current while people keep editing.
 */
export function BranchReview(props: Props) {
  const page = useCollab(props.pageId, props.me.id, denied);
  const branch = useCollab(props.pageId, props.me.id, denied, props.branchId);
  const pageState = useSyncState(page?.provider ?? null);
  const branchState = useSyncState(branch?.provider ?? null);
  const ready = page && branch && isSynced(pageState) && isSynced(branchState);
  if (!ready) return <ReviewSkeleton {...props} />;
  return <Review {...props} page={page} branch={branch} />;
}

const isSynced = (state: string) => state === "saved" || state === "saving";

/** Bumps a counter whenever either document changes, so the diff recomputes. */
function useDocsVersion(...docs: Y.Doc[]) {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let frame = 0;
    const bump = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setVersion((v) => v + 1));
    };
    docs.forEach((d) => d.on("update", bump));
    return () => {
      cancelAnimationFrame(frame);
      docs.forEach((d) => d.off("update", bump));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, docs);
  return version;
}

function copyOf(doc: Y.Doc) {
  const copy = new Y.Doc();
  Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
  return copy;
}

/** Resolves once the server has every change this browser made. */
function whenSaved(provider: HocuspocusProvider) {
  return new Promise<void>((resolve) => {
    const check = () => {
      if (provider.hasUnsyncedChanges) return;
      provider.off("unsyncedChanges", check);
      resolve();
    };
    provider.on("unsyncedChanges", check);
    check();
  });
}

function Review({
  page,
  branch,
  branchId,
  branchName,
  pageTitle,
  kind,
  base,
  members,
  canMerge,
  pageUrl,
  branchUrl,
}: Props & { page: Collab; branch: Collab }) {
  const router = useRouter();
  const [merging, startMerge] = useTransition();
  const [pulling, startPull] = useTransition();
  // A branch opened for the first time on this screen was just copied from the page.
  const [baseDoc, setBaseDoc] = useState(() => (base ? docFromBase64(base) : copyOf(branch.doc)));
  const version = useDocsVersion(page.doc, branch.doc);

  const review = useMemo(() => {
    const merged = mergedPreview(page.doc, branch.doc);
    if (kind === "doc") {
      const changes = diffDocs(baseDoc, branch.doc);
      const pageSince = diffDocs(baseDoc, page.doc);
      return {
        kind,
        changes,
        count: changes.added + changes.removed + changes.changed,
        pageChanged: pageSince.added + pageSince.removed + pageSince.changed > 0,
        result: diffDocs(page.doc, merged, Number.POSITIVE_INFINITY),
        merged,
      } as const;
    }
    // Boards and canvases both describe changes as a list ("Moved X to Done").
    const diff = kind === "board" ? (a: Y.Doc, b: Y.Doc) => diffBoards(a, b, members) : diffCanvases;
    const changes = diff(baseDoc, branch.doc);
    return {
      kind,
      changes,
      count: changes.length,
      pageChanged: diff(baseDoc, page.doc).length > 0,
      result: diff(page.doc, merged),
      merged,
    } as const;
    // version: re-read the live docs after every change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.doc, branch.doc, baseDoc, kind, members, version]);

  function merge() {
    startMerge(async () => {
      // Everything the branch has that the page doesn't. Yjs merges it with
      // whatever changed on the page meanwhile, so nobody's work is lost.
      const update = Y.encodeStateAsUpdate(branch.doc, Y.encodeStateVector(page.doc));
      Y.applyUpdate(page.doc, update, "branch-merge");
      await whenSaved(page.provider);
      const result = await markBranchMerged(branchId);
      if (!result.ok) {
        toast.error("Merged, but couldn't mark the branch as merged", { description: result.error });
        return;
      }
      window.dispatchEvent(new Event(ANNOUNCE_BRANCH_EVENT));
      toast.success(`Merged “${branchName}” into “${pageTitle}”`, {
        description: "Everyone sees the changes now. To undo, use Rewind on the page.",
      });
      router.push(pageUrl);
    });
  }

  function pullFromPage() {
    startPull(async () => {
      const update = Y.encodeStateAsUpdate(page.doc, Y.encodeStateVector(branch.doc));
      Y.applyUpdate(branch.doc, update, "branch-pull");
      await whenSaved(branch.provider);
      const snapshot = Y.encodeStateAsUpdate(page.doc);
      const result = await setBranchBase(branchId, toBase64(snapshot));
      if (!result.ok) {
        toast.error("Couldn't update the branch", { description: result.error });
        return;
      }
      setBaseDoc(copyOf(page.doc));
      toast.success("Branch updated from the page", {
        description: "It now has the page's latest changes, plus its own.",
      });
    });
  }

  const summary =
    review.kind === "doc"
      ? [
          review.changes.added && `${review.changes.added} added`,
          review.changes.changed && `${review.changes.changed} edited`,
          review.changes.removed && `${review.changes.removed} removed`,
        ]
          .filter(Boolean)
          .join(" · ") || "No changes"
      : `${review.count} ${review.count === 1 ? "change" : "changes"}`;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link href={branchUrl}>
          <ArrowLeft aria-hidden="true" /> Back to the branch
        </Link>
      </Button>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Review branch</p>
          <h1 className="text-3xl font-bold tracking-tight">{branchName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Into “{pageTitle}” · <span data-testid="change-summary">{summary}</span>
          </p>
        </div>
        {canMerge && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="brand" size="lg" disabled={review.count === 0 || merging}>
                <GitMerge aria-hidden="true" /> {merging ? "Merging…" : "Merge into page"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Merge “{branchName}” into “{pageTitle}”?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Everyone on the page sees the changes right away
                  {review.pageChanged ? ", and edits made on the page since the branch started are kept" : ""}. The
                  branch becomes view-only. You can always undo with Rewind.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={merge}>Merge</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {review.pageChanged && (
        <Alert variant="warning">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>“{pageTitle}” has changed since this branch started</AlertTitle>
          <AlertDescription>
            <p>
              Merging keeps both sets of changes. Check <strong>Page after merge</strong> to see the result, or bring the
              page&apos;s latest changes into the branch first.
            </p>
            {canMerge && (
              <Button variant="outline" size="sm" className="mt-1" onClick={pullFromPage} disabled={pulling}>
                <RefreshCw aria-hidden="true" className={pulling ? "animate-spin" : undefined} />
                {pulling ? "Updating…" : "Update branch from page"}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {review.count === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-card p-10 text-center">
          <p className="font-medium">This branch has no changes yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Edit the branch, then come back here to review and merge.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href={branchUrl}>Edit the branch</Link>
          </Button>
        </div>
      ) : (
        <Tabs defaultValue="changes">
          <TabsList>
            <TabsTrigger value="changes">Changes in this branch</TabsTrigger>
            <TabsTrigger value="result">Page after merge</TabsTrigger>
          </TabsList>
          <TabsContent value="changes" className="mt-2">
            {review.kind === "doc" ? (
              <DocDiffView rows={review.changes.rows} label="Changes in this branch" />
            ) : (
              <BoardChangesView changes={review.changes} label="Changes in this branch" />
            )}
          </TabsContent>
          <TabsContent value="result" className="mt-2 flex flex-col gap-4">
            {review.kind === "doc" ? (
              <>
                <p className="text-sm text-muted-foreground">
                  The whole page as it will be, with what merging changes highlighted.
                </p>
                <DocDiffView rows={review.result.rows} label="Page after merge" />
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  The {review.kind} as it will be after merging.
                </p>
                <div className="rounded-xl border bg-card p-4">
                  {review.kind === "board" ? (
                    <ReplayBoard doc={review.merged} version={version} members={members} />
                  ) : (
                    <ReplayCanvas doc={review.merged} version={version} />
                  )}
                </div>
                {review.result.length > 0 && (
                  <BoardChangesView changes={review.result} label={`What merging changes on the ${review.kind}`} />
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      )}

      {!canMerge && (
        <p className="text-sm text-muted-foreground">Guests can review branches, but only members can merge them.</p>
      )}
    </div>
  );
}

function ReviewSkeleton({ branchName }: Props) {
  return (
    <div aria-busy="true" className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8">
      <Skeleton className="h-8 w-40" />
      <div>
        <p className="text-sm text-muted-foreground">Review branch</p>
        <h1 className="text-3xl font-bold tracking-tight">{branchName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Comparing with the page…</p>
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
