"use client";

import Mention from "@tiptap/extension-mention";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import { forwardRef, useImperativeHandle, useState } from "react";
import { MemberAvatar } from "@/components/member-avatar";
import { cn } from "@/lib/utils";

/** How long to wait before notifying, so the notification can quote the finished sentence. */
const MENTION_SNIPPET_DELAY = 4000;

export type Mentionable = { id: string; name: string; color: string };

/**
 * @mentions. Typing "@" lists the workspace's members; picking one inserts a
 * mention and calls `onMention`, which notifies them. Only the person who
 * typed the mention triggers the notification, not everyone who sees it sync.
 *
 * `mentionDisplay()` is the read-only version, for Rewind and branch review.
 */

const base = (meId?: string) =>
  Mention.configure({
    HTMLAttributes: { class: "mention" },
    renderText: ({ node }) => `@${node.attrs.label ?? "someone"}`,
    renderHTML: ({ node }) => [
      "span",
      {
        class: "mention",
        "data-type": "mention",
        "data-id": node.attrs.id,
        // Lets the CSS highlight mentions of you.
        ...(meId && node.attrs.id === meId ? { "data-me": "true" } : {}),
      },
      `@${node.attrs.label ?? "someone"}`,
    ],
  });

export const mentionDisplay = () => base();

type ListHandle = { onKeyDown: (props: SuggestionKeyDownProps) => boolean };

const MentionList = forwardRef<ListHandle, SuggestionProps<Mentionable>>(function MentionList(props, ref) {
  const [active, setActive] = useState(0);
  const [lastItems, setLastItems] = useState(props.items);
  // Reset the highlight when the list changes (adjusting state during render, per the React docs).
  if (lastItems !== props.items) {
    setLastItems(props.items);
    setActive(0);
  }
  const pick = (index: number) => {
    const item = props.items[index];
    if (item) props.command({ id: item.id, label: item.name });
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      const n = props.items.length;
      if (n === 0) return false;
      if (event.key === "ArrowDown") return setActive((i) => (i + 1) % n), true;
      if (event.key === "ArrowUp") return setActive((i) => (i - 1 + n) % n), true;
      if (event.key === "Enter" || event.key === "Tab") return pick(active), true;
      return false;
    },
  }));

  return (
    <div
      role="listbox"
      aria-label="Mention someone"
      className="w-64 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
    >
      {props.items.length === 0 ? (
        <p className="px-2 py-1.5 text-sm text-muted-foreground">No one matches “{props.query}”</p>
      ) : (
        props.items.map((m, i) => (
          <button
            key={m.id}
            type="button"
            role="option"
            aria-selected={i === active}
            onMouseEnter={() => setActive(i)}
            onMouseDown={(e) => e.preventDefault()} // keep focus in the editor
            onClick={() => pick(i)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
              i === active && "bg-accent",
            )}
          >
            <MemberAvatar name={m.name} color={m.color} className="size-6" />
            <span className="truncate">{m.name}</span>
          </button>
        ))
      )}
    </div>
  );
});

/** The editable version: suggestions from `getMembers()`, and `onMention` once a mention is inserted. */
export function mentionExtension({
  meId,
  getMembers,
  onMention,
}: {
  meId: string;
  getMembers: () => Mentionable[];
  onMention: (userId: string, snippet: string) => void;
}) {
  return base(meId).configure({
    suggestion: {
      char: "@",
      allowSpaces: true,
      items: ({ query }) => {
        const q = query.toLowerCase().trim();
        return getMembers()
          .filter((m) => m.id !== meId && (!q || m.name.toLowerCase().includes(q)))
          .slice(0, 6);
      },
      command: ({ editor, range, props }) => {
        editor
          .chain()
          .focus()
          .insertContentAt(range, [
            { type: "mention", attrs: props },
            { type: "text", text: " " },
          ])
          .run();
        if (!props.id) return;
        const id = String(props.id);
        // Quote the sentence in the notification. Wait a moment first, so it
        // includes what they type after the name ("@Ravi can you check…").
        const sentence = () => {
          const block = editor.state.selection.$from.parent;
          return block.textBetween(0, block.content.size, " ", (leaf) =>
            leaf.type.name === "mention" ? `@${leaf.attrs.label ?? ""}` : "",
          );
        };
        const early = sentence();
        setTimeout(() => {
          let text = early;
          if (!editor.isDestroyed) {
            const now = sentence();
            // Only if the cursor is still in the sentence with the mention.
            if (now.includes(`@${props.label ?? ""}`)) text = now;
          }
          onMention(id, text);
        }, MENTION_SNIPPET_DELAY);
      },
      render: () => {
        let renderer: ReactRenderer<ListHandle, SuggestionProps<Mentionable>> | null = null;
        let box: HTMLDivElement | null = null;
        const place = (props: SuggestionProps<Mentionable>) => {
          const rect = props.clientRect?.();
          if (!rect || !box) return;
          box.style.left = `${Math.min(rect.left, window.innerWidth - 272)}px`;
          box.style.top = `${rect.bottom + 6}px`;
        };
        return {
          onStart: (props) => {
            renderer = new ReactRenderer(MentionList, { props, editor: props.editor });
            box = document.createElement("div");
            box.style.position = "fixed";
            box.style.zIndex = "60";
            box.appendChild(renderer.element);
            document.body.appendChild(box);
            place(props);
          },
          onUpdate: (props) => {
            renderer?.updateProps(props);
            place(props);
          },
          onKeyDown: (props) => {
            if (props.event.key === "Escape") {
              box?.remove();
              return true;
            }
            return renderer?.ref?.onKeyDown(props) ?? false;
          },
          onExit: () => {
            box?.remove();
            renderer?.destroy();
            box = null;
            renderer = null;
          },
        };
      },
    },
  });
}
