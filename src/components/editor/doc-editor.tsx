"use client";

import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Eye } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { MemberAvatar } from "@/components/member-avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Toolbar } from "./toolbar";
import { useCollab, usePeers, useSyncState, type Collab, type SyncState } from "./use-collab";

type Me = { name: string; color: string };

/** A live, multiplayer doc. Content lives in Yjs and syncs through the sync server. */
export function DocEditor({ pageId, me, readOnly }: { pageId: string; me: Me; readOnly: boolean }) {
  const collab = useCollab(pageId, () =>
    toast.error("Couldn't open this doc", {
      description: "You may no longer have access, or your session expired. Try reloading.",
      id: "doc-access",
    }),
  );
  if (!collab) return <EditorSkeleton />;
  return <LiveEditor collab={collab} me={me} readOnly={readOnly} />;
}

function LiveEditor({ collab, me, readOnly }: { collab: Collab; me: Me; readOnly: boolean }) {
  const { doc, provider } = collab;
  const sync = useSyncState(provider);
  const peers = usePeers(provider);
  useConnectionToasts(sync);

  const editor = useEditor(
    {
      immediatelyRender: false,
      editable: !readOnly,
      extensions: [
        // Yjs has its own undo history, so turn off the built-in one.
        StarterKit.configure({ undoRedo: false, heading: { levels: [1, 2, 3] } }),
        Collaboration.configure({ document: doc }),
        CollaborationCaret.configure({ provider, user: me }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Placeholder.configure({
          placeholder: "Start writing… Type # and a space for a heading, - for a list, [] for a to-do",
        }),
      ],
      editorProps: {
        attributes: { class: "braid-prose", "aria-label": "Document", spellcheck: "true" },
      },
    },
    [doc, provider],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-0 z-10 -mx-2 flex flex-wrap items-center justify-between gap-3 border-b bg-background/95 px-2 py-2 backdrop-blur">
        {editor && !readOnly ? (
          <Toolbar editor={editor} />
        ) : (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Eye className="size-4" aria-hidden="true" /> View only
          </span>
        )}
        <div className="flex items-center gap-3">
          <Presence peers={peers} />
          <SyncBadge state={sync} />
        </div>
      </div>
      {editor ? <EditorContent editor={editor} /> : <EditorSkeleton />}
    </div>
  );
}

function Presence({ peers }: { peers: { clientId: number; name: string; color: string }[] }) {
  if (peers.length === 0) return <span className="text-xs text-muted-foreground">Only you here</span>;
  const shown = peers.slice(0, 4);
  return (
    <div className="flex items-center gap-2" aria-label={`Also here: ${peers.map((p) => p.name).join(", ")}`}>
      <div className="flex -space-x-2">
        {shown.map((p) => (
          <MemberAvatar key={p.clientId} name={p.name} color={p.color} className="size-7 ring-2 ring-background" />
        ))}
        {peers.length > shown.length && (
          <span className="grid size-7 place-items-center rounded-full bg-zinc-200 text-xs font-semibold ring-2 ring-background">
            +{peers.length - shown.length}
          </span>
        )}
      </div>
      <span className="text-xs text-muted-foreground">
        {peers.length === 1 ? `${peers[0].name.split(" ")[0]} is here` : `${peers.length} others here`}
      </span>
    </div>
  );
}

const syncLabel: Record<SyncState, { text: string; dot: string }> = {
  connecting: { text: "Connecting…", dot: "bg-zinc-400" },
  syncing: { text: "Syncing…", dot: "bg-amber-500" },
  saving: { text: "Saving…", dot: "bg-amber-500" },
  saved: { text: "Saved", dot: "bg-green-600" },
  offline: { text: "Offline", dot: "bg-red-600" },
};

function SyncBadge({ state }: { state: SyncState }) {
  const { text, dot } = syncLabel[state];
  return (
    <span role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("size-2 rounded-full", dot)} aria-hidden="true" />
      {text}
    </span>
  );
}

/** Toast when the connection drops after being live, and when it comes back. */
function useConnectionToasts(state: SyncState) {
  const wasLive = useRef(false);
  const lostShown = useRef(false);
  useEffect(() => {
    if (state === "saved" || state === "saving") {
      if (lostShown.current) toast.success("Back online", { id: "connection" });
      wasLive.current = true;
      lostShown.current = false;
    } else if (state === "offline" && wasLive.current && !lostShown.current) {
      lostShown.current = true;
      toast.warning("Connection lost", {
        id: "connection",
        description: "Keep this tab open. Your edits will sync when it reconnects.",
      });
    }
  }, [state]);
}

function EditorSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3 pt-14">
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-5 w-1/2" />
    </div>
  );
}
