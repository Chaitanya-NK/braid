"use client";

import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Quote,
  Redo2,
  SquareCode,
  Strikethrough,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tool = {
  label: string;
  shortcut?: string;
  icon: LucideIcon;
  run: (e: Editor) => void;
  active?: (e: Editor) => boolean;
};

const groups: Tool[][] = [
  [
    { label: "Undo", shortcut: "Ctrl+Z", icon: Undo2, run: (e) => e.chain().focus().undo().run() },
    { label: "Redo", shortcut: "Ctrl+Shift+Z", icon: Redo2, run: (e) => e.chain().focus().redo().run() },
  ],
  [
    { label: "Heading 1", icon: Heading1, run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(), active: (e) => e.isActive("heading", { level: 1 }) },
    { label: "Heading 2", icon: Heading2, run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(), active: (e) => e.isActive("heading", { level: 2 }) },
    { label: "Heading 3", icon: Heading3, run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(), active: (e) => e.isActive("heading", { level: 3 }) },
  ],
  [
    { label: "Bold", shortcut: "Ctrl+B", icon: Bold, run: (e) => e.chain().focus().toggleBold().run(), active: (e) => e.isActive("bold") },
    { label: "Italic", shortcut: "Ctrl+I", icon: Italic, run: (e) => e.chain().focus().toggleItalic().run(), active: (e) => e.isActive("italic") },
    { label: "Strikethrough", icon: Strikethrough, run: (e) => e.chain().focus().toggleStrike().run(), active: (e) => e.isActive("strike") },
    { label: "Inline code", icon: Code, run: (e) => e.chain().focus().toggleCode().run(), active: (e) => e.isActive("code") },
  ],
  [
    { label: "Bullet list", icon: List, run: (e) => e.chain().focus().toggleBulletList().run(), active: (e) => e.isActive("bulletList") },
    { label: "Numbered list", icon: ListOrdered, run: (e) => e.chain().focus().toggleOrderedList().run(), active: (e) => e.isActive("orderedList") },
    { label: "To-do list", icon: ListTodo, run: (e) => e.chain().focus().toggleTaskList().run(), active: (e) => e.isActive("taskList") },
    { label: "Quote", icon: Quote, run: (e) => e.chain().focus().toggleBlockquote().run(), active: (e) => e.isActive("blockquote") },
    { label: "Code block", icon: SquareCode, run: (e) => e.chain().focus().toggleCodeBlock().run(), active: (e) => e.isActive("codeBlock") },
    { label: "Divider", icon: Minus, run: (e) => e.chain().focus().setHorizontalRule().run() },
  ],
];

const allTools = groups.flat();

export function Toolbar({ editor }: { editor: Editor }) {
  // Re-render only when an active state changes, not on every keystroke.
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => allTools.map((t) => (t.active ? t.active(e) : false)),
  });

  let index = 0;
  return (
    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-1">
      {groups.map((group, g) => (
        <div key={g} className="flex items-center gap-0.5 border-r pr-1 last:border-r-0">
          {group.map((tool) => {
            const isActive = active[index++];
            const Icon = tool.icon;
            return (
              <button
                key={tool.label}
                type="button"
                aria-label={tool.label}
                title={tool.shortcut ? `${tool.label} (${tool.shortcut})` : tool.label}
                aria-pressed={tool.active ? isActive : undefined}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => tool.run(editor)}
                className={cn(
                  "grid size-9 place-items-center rounded-md text-zinc-700 hover:bg-accent",
                  isActive && "bg-brand-soft text-brand-strong",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
