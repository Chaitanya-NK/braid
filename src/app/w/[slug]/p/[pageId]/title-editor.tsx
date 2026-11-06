"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { renamePage } from "@/lib/actions";
import { cn } from "@/lib/utils";

/** Big editable page title. Saves on Enter or when the field loses focus. */
export function TitleEditor({
  pageId,
  initialTitle,
  size = "lg",
}: {
  pageId: string;
  initialTitle: string;
  size?: "md" | "lg";
}) {
  const [title, setTitle] = useState(initialTitle);
  const saved = useRef(initialTitle);
  const [pending, startTransition] = useTransition();

  function save() {
    const next = title.trim() || "Untitled";
    if (next === saved.current) return;
    const previous = saved.current;
    saved.current = next;
    setTitle(next);
    startTransition(async () => {
      const result = await renamePage(pageId, next);
      if (!result.ok) {
        saved.current = previous;
        setTitle(previous);
        toast.error("Couldn't rename the page", { description: result.error });
        return;
      }
      toast.success("Page renamed", { description: next });
    });
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
        className={cn(
          "w-full rounded-lg bg-transparent font-bold tracking-tight outline-none placeholder:text-zinc-300 focus-visible:bg-zinc-50",
          size === "lg" ? "text-4xl" : "text-2xl",
        )}
        placeholder="Untitled"
      />
      <span aria-live="polite" className="shrink-0 text-xs text-muted-foreground">
        {pending ? "Saving…" : ""}
      </span>
    </div>
  );
}
