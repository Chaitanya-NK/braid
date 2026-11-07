import {
  ArrowRightLeft,
  Columns3,
  Minus,
  Pencil,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { BoardChange, DiffRow, Line, WordPart } from "@/lib/branch-diff";
import { cn } from "@/lib/utils";

/* ---------------------------------- Docs ---------------------------------- */

const LINE_STYLE: Record<Line["kind"], string> = {
  h1: "text-2xl font-bold tracking-tight",
  h2: "text-xl font-semibold tracking-tight",
  h3: "text-lg font-semibold",
  p: "",
  bullet: "",
  number: "",
  task: "",
  quote: "border-l-2 border-zinc-300 pl-3 italic text-zinc-700",
  code: "font-mono text-[13px]",
  rule: "",
};

function Marker({ line }: { line: Line }) {
  if (line.kind === "bullet") return <span aria-hidden="true">•</span>;
  if (line.kind === "number") return <span aria-hidden="true">1.</span>;
  if (line.kind === "task")
    return <span aria-label={line.checked ? "Done:" : "To do:"}>{line.checked ? "☑" : "☐"}</span>;
  return null;
}

function LineText({ line, words }: { line: Line; words?: WordPart[] }) {
  if (line.kind === "rule") return <hr className="my-2 w-full border-zinc-300" />;
  const content = words
    ? words.map((w, i) =>
        w.type === "same" ? (
          <span key={i}>{w.text}</span>
        ) : w.type === "removed" ? (
          <del key={i} className="rounded-sm bg-red-200/70 text-red-950 decoration-red-700/60">
            {w.text}
          </del>
        ) : (
          <ins key={i} className="rounded-sm bg-emerald-200/70 text-emerald-950 no-underline">
            {w.text}
          </ins>
        ),
      )
    : line.text || <span className="text-muted-foreground italic">empty line</span>;
  return (
    <span className={cn("flex min-w-0 gap-2", LINE_STYLE[line.kind])}>
      <Marker line={line} />
      <span className="min-w-0 break-words whitespace-pre-wrap">{content}</span>
    </span>
  );
}

const ROW: Record<Exclude<DiffRow["type"], "skip">, { label: string; className: string; sign: string }> = {
  same: { label: "", className: "border-transparent", sign: "" },
  added: { label: "Added", className: "border-emerald-500 bg-emerald-50", sign: "+" },
  removed: { label: "Removed", className: "border-red-400 bg-red-50 text-red-950/80 [&_span]:line-through", sign: "−" },
  changed: { label: "Changed", className: "border-amber-400 bg-amber-50", sign: "~" },
};

/** A doc diff: every line, with added, removed and changed lines marked. */
export function DocDiffView({ rows, label }: { rows: DiffRow[]; label: string }) {
  return (
    <ol aria-label={label} className="flex flex-col gap-0.5 rounded-xl border bg-card p-4 text-[15px] leading-relaxed">
      {rows.map((row, i) => {
        if (row.type === "skip") {
          return (
            <li key={i} className="my-1 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              {row.count} unchanged {row.count === 1 ? "line" : "lines"}
              <span className="h-px flex-1 bg-border" />
            </li>
          );
        }
        const style = ROW[row.type];
        return (
          <li
            key={i}
            data-change={row.type}
            className={cn("flex gap-2 rounded-r-md border-l-[3px] py-0.5 pr-2 pl-2", style.className)}
            style={{ marginLeft: `${Math.max(0, row.line.depth - 1) * 1.25}rem` }}
          >
            <span aria-hidden="true" className="w-3 shrink-0 font-mono text-xs leading-6 text-muted-foreground">
              {style.sign}
            </span>
            {style.label && <span className="sr-only">{style.label}:</span>}
            <LineText line={row.line} words={row.type === "changed" ? row.words : undefined} />
          </li>
        );
      })}
    </ol>
  );
}

/* --------------------------------- Boards --------------------------------- */

const CHANGE: Record<BoardChange["kind"], { label: string; icon: LucideIcon; className: string }> = {
  added: { label: "Added", icon: Plus, className: "bg-emerald-100 text-emerald-900" },
  removed: { label: "Removed", icon: Minus, className: "bg-red-100 text-red-900" },
  moved: { label: "Moved", icon: ArrowRightLeft, className: "bg-blue-100 text-blue-900" },
  edited: { label: "Edited", icon: Pencil, className: "bg-amber-100 text-amber-900" },
  "column-added": { label: "New column", icon: Columns3, className: "bg-emerald-100 text-emerald-900" },
  "column-removed": { label: "Column removed", icon: Columns3, className: "bg-red-100 text-red-900" },
  "column-renamed": { label: "Column renamed", icon: Columns3, className: "bg-amber-100 text-amber-900" },
};

/** A board diff as a list of plain-language changes. */
export function BoardChangesView({ changes, label }: { changes: BoardChange[]; label: string }) {
  return (
    <ul aria-label={label} className="flex flex-col divide-y rounded-xl border bg-card">
      {changes.map((change, i) => {
        const { label: kindLabel, icon: Icon, className } = CHANGE[change.kind];
        return (
          <li key={i} className="flex items-center gap-3 px-4 py-3 text-sm">
            <Badge className={cn("w-32 justify-start", className)}>
              <Icon aria-hidden="true" /> {kindLabel}
            </Badge>
            <span className="font-medium">{change.title || "Untitled"}</span>
            {change.detail && <span className="text-muted-foreground">{change.detail}</span>}
          </li>
        );
      })}
    </ul>
  );
}
