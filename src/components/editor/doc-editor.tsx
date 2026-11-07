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
import { Skeleton } from "@/components/ui/skeleton";
import { Toolbar } from "./toolbar";
import { mentionExtension, type Mentionable } from "./mention";
import { notifyMention } from "@/lib/notification-actions";
import { Presence, SyncBadge, useConnectionToasts } from "@/components/collab/status";
import {
  useCollab,
  usePeers,
  usePendingChanges,
  useSyncState,
  type Collab,
} from "@/components/collab/use-collab";

type Me = { id: string; name: string; color: string };

/** A live, multiplayer doc. Content lives in Yjs and syncs through the sync server. */
export function DocEditor({
  pageId,
  branchId = null,
  me,
  readOnly,
  members = [],
}: {
  pageId: string;
  /** Edit one of the page's branches instead of the page itself. */
  branchId?: string | null;
  me: Me;
  readOnly: boolean;
  /** People who can be @mentioned. */
  members?: Mentionable[];
}) {
  const collab = useCollab(
    pageId,
    me.id,
    () =>
      toast.error("Couldn't open this doc", {
        description: "You may no longer have access, or your session expired. Try reloading.",
        id: "doc-access",
      }),
    branchId,
  );
  if (!collab) return <EditorSkeleton />;
  const onMention = (userId: string, snippet: string) =>
    void notifyMention(pageId, branchId, [userId], snippet).then(
      (sent) => sent > 0 && toast.success(`${members.find((m) => m.id === userId)?.name ?? "They"} will be notified`),
      () => {},
    );
  return <LiveEditor collab={collab} me={me} readOnly={readOnly} members={members} onMention={onMention} />;
}

function LiveEditor({
  collab,
  me,
  readOnly,
  members,
  onMention,
}: {
  collab: Collab;
  me: Me;
  readOnly: boolean;
  members: Mentionable[];
  onMention: (userId: string, snippet: string) => void;
}) {
  // Read through refs so the editor isn't rebuilt when the member list or callback changes.
  const membersRef = useRef(members);
  const onMentionRef = useRef(onMention);
  useEffect(() => {
    membersRef.current = members;
    onMentionRef.current = onMention;
  });
  const { doc, provider, tracker } = collab;
  const sync = useSyncState(provider);
  const pending = usePendingChanges(tracker);
  const peers = usePeers(provider);
  useConnectionToasts(sync, tracker);

  const editor = useEditor(
    {
      immediatelyRender: false,
      editable: !readOnly,
      extensions: [
        // Yjs has its own undo history, so turn off the built-in one.
        StarterKit.configure({ undoRedo: false, heading: { levels: [1, 2, 3] } }),
        Collaboration.configure({ document: doc }),
        CollaborationCaret.configure({ provider, user: { name: me.name, color: me.color } }),
        TaskList,
        TaskItem.configure({ nested: true }),
        // The refs are read only when someone types "@", never while rendering.
        // eslint-disable-next-line react-hooks/refs
        mentionExtension({
          meId: me.id,
          getMembers: () => membersRef.current,
          onMention: (userId, snippet) => onMentionRef.current(userId, snippet),
        }),
        Placeholder.configure({
          placeholder: "Start writing… Type # for a heading, - for a list, [] for a to-do, @ to mention someone",
        }),
      ],
      editorProps: {
        attributes: { class: "braid-prose", "aria-label": "Document", spellcheck: "true" },
      },
    },
    [doc, provider],
  );

  // Becomes view-only live, e.g. when someone merges the branch you're on.
  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

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
          <SyncBadge state={sync} pending={pending} />
        </div>
      </div>
      {editor ? <EditorContent editor={editor} /> : <EditorSkeleton />}
    </div>
  );
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
