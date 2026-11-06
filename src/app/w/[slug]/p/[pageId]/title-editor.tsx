"use client";

import { useRef, useState, useTransition } from "react";
import { renamePage } from "@/lib/actions";

/** Big editable page title. Saves on Enter or when the field loses focus. */
export function TitleEditor({ pageId, initialTitle }: { pageId: string; initialTitle: string }) {
  const [title, setTitle] = useState(initialTitle);
  const saved = useRef(initialTitle);
  const [pending, startTransition] = useTransition();

  function save() {
    const next = title.trim() || "Untitled";
    if (next === saved.current) return;
    saved.current = next;
    setTitle(next);
    startTransition(() => renamePage(pageId, next));
  }

  return (
    <div className="flex items-center gap-3">
      <label htmlFor="page-title" className="sr-only">
        Page title
      </label>
      <input
        id="page-title"
        value={title}
        maxLength={120}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setTitle(saved.current);
            e.currentTarget.blur();
          }
        }}
        className="w-full rounded-lg bg-transparent text-4xl font-bold tracking-tight outline-none placeholder:text-zinc-300 focus-visible:bg-zinc-50 focus-visible:outline-none"
        placeholder="Untitled"
      />
      <span aria-live="polite" className="shrink-0 text-xs text-muted">
        {pending ? "Saving…" : ""}
      </span>
    </div>
  );
}
