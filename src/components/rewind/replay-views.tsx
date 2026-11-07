"use client";

import Collaboration from "@tiptap/extension-collaboration";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useMemo } from "react";
import type * as Y from "yjs";
import { CardFace, type Member } from "@/components/board/card-tile";
import { readBoard } from "@/lib/board-model";
import { mentionDisplay } from "@/components/editor/mention";

/** A read-only doc bound to the replay document; re-renders as steps apply. */
export function ReplayDoc({ doc }: { doc: Y.Doc }) {
  const editor = useEditor(
    {
      immediatelyRender: false,
      editable: false,
      extensions: [
        StarterKit.configure({ undoRedo: false, heading: { levels: [1, 2, 3] } }),
        Collaboration.configure({ document: doc }),
        TaskList,
        TaskItem.configure({ nested: true }),
        mentionDisplay(),
      ],
      editorProps: { attributes: { class: "braid-prose", "aria-label": "Document at this moment" } },
    },
    [doc],
  );
  return <EditorContent editor={editor} />;
}

/** A static board as it was at this moment. `version` forces a re-read after each step. */
export function ReplayBoard({ doc, version, members }: { doc: Y.Doc; version: number; members: Member[] }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const board = useMemo(() => readBoard(doc), [doc, version]);
  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  if (board.columns.length === 0) {
    return <p className="text-muted-foreground">The board was empty at this point.</p>;
  }
  return (
    <div className="flex items-start gap-4 overflow-x-auto pb-2" aria-label="Board at this moment">
      {board.columns.map((col) => (
        <section key={col.id} aria-label={col.title} className="flex w-[260px] shrink-0 flex-col gap-2 rounded-xl bg-sunken p-2.5">
          <h3 className="flex justify-between px-1 text-sm font-semibold">
            {col.title}
            <span className="font-normal text-muted-foreground">{col.cards.length}</span>
          </h3>
          {col.cards.map((card) => (
            <CardFace key={card.id} card={card} members={memberMap} />
          ))}
        </section>
      ))}
    </div>
  );
}
