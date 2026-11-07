import * as Y from "yjs";
import { readBoard, type BoardSnapshot, type Card } from "@/lib/board-model";

/**
 * Compares two versions of a page for branch review. Works on plain Yjs
 * documents, so it runs in the browser on live data.
 *
 * Docs become a list of lines (one per paragraph, heading, list item…),
 * compared line by line, with word-level detail for lines that changed.
 * Boards become a list of plain-language changes ("Moved X to Done").
 */

/* ---------------------------------- Docs ---------------------------------- */

export type LineKind = "h1" | "h2" | "h3" | "p" | "bullet" | "number" | "task" | "quote" | "code" | "rule";
export type Line = { kind: LineKind; text: string; depth: number; checked?: boolean };

function textOf(node: Y.XmlElement | Y.XmlText): string {
  if (node instanceof Y.XmlText) {
    return (node.toDelta() as { insert: unknown }[])
      .map((op) => (typeof op.insert === "string" ? op.insert : ""))
      .join("");
  }
  return node
    .toArray()
    .map((child) => (child instanceof Y.XmlElement || child instanceof Y.XmlText ? textOf(child) : ""))
    .join("");
}

/** The doc as lines, in reading order. */
export function docLines(doc: Y.Doc): Line[] {
  const lines: Line[] = [];
  const walk = (nodes: unknown[], list: LineKind | null, depth: number, quote: boolean, checked?: boolean) => {
    for (const node of nodes) {
      if (node instanceof Y.XmlText) {
        const text = textOf(node);
        if (text) lines.push({ kind: quote ? "quote" : "p", text, depth });
        continue;
      }
      if (!(node instanceof Y.XmlElement)) continue;
      const name = node.nodeName;
      const children = node.toArray();
      switch (name) {
        case "heading": {
          const level = Number(node.getAttribute("level") ?? 1);
          lines.push({ kind: level === 1 ? "h1" : level === 2 ? "h2" : "h3", text: textOf(node), depth });
          break;
        }
        case "paragraph":
          lines.push({
            kind: list ?? (quote ? "quote" : "p"),
            text: textOf(node),
            depth,
            ...(list === "task" ? { checked } : {}),
          });
          // Only the first paragraph of a list item gets the bullet.
          list = null;
          break;
        case "codeBlock":
          for (const text of textOf(node).split("\n")) lines.push({ kind: "code", text, depth });
          break;
        case "horizontalRule":
          lines.push({ kind: "rule", text: "", depth });
          break;
        case "blockquote":
          walk(children, null, depth, true);
          break;
        case "bulletList":
        case "orderedList":
        case "taskList":
          for (const item of children) {
            if (!(item instanceof Y.XmlElement)) continue;
            const kind: LineKind = name === "bulletList" ? "bullet" : name === "orderedList" ? "number" : "task";
            const done = name === "taskList" ? Boolean(item.getAttribute("checked")) : undefined;
            walk(item.toArray(), kind, depth + 1, quote, done);
          }
          break;
        default:
          walk(children, list, depth, quote, checked);
      }
    }
  };
  walk(doc.getXmlFragment("default").toArray(), null, 0, false);
  // An empty trailing paragraph is just where the cursor was.
  while (lines.length && lines[lines.length - 1].kind === "p" && !lines[lines.length - 1].text) lines.pop();
  return lines;
}

const lineKey = (l: Line) => `${l.kind}|${l.depth}|${l.checked ? 1 : 0}|${l.text}`;

/** Longest-common-subsequence diff of two lists, as same / removed / added runs. */
function diffSequences<T>(a: T[], b: T[], key: (x: T) => string) {
  type Op = { type: "same" | "removed" | "added"; item: T };
  const ka = a.map(key);
  const kb = b.map(key);
  // Trim the common start and end: most edits touch a small part of a doc.
  let start = 0;
  while (start < a.length && start < b.length && ka[start] === kb[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && ka[endA - 1] === kb[endB - 1]) {
    endA--;
    endB--;
  }
  const n = endA - start;
  const m = endB - start;
  const ops: Op[] = [];
  for (let i = 0; i < start; i++) ops.push({ type: "same", item: b[i] });

  if (n * m > 4_000_000) {
    // Too big to compare finely: show it as replaced.
    for (let i = start; i < endA; i++) ops.push({ type: "removed", item: a[i] });
    for (let j = start; j < endB; j++) ops.push({ type: "added", item: b[j] });
  } else {
    const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        table[i][j] =
          ka[start + i] === kb[start + j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && ka[start + i] === kb[start + j]) {
        ops.push({ type: "same", item: b[start + j] });
        i++;
        j++;
      } else if (i < n && (j === m || table[i + 1][j] >= table[i][j + 1])) {
        ops.push({ type: "removed", item: a[start + i] });
        i++;
      } else {
        ops.push({ type: "added", item: b[start + j] });
        j++;
      }
    }
  }
  for (let i = endB; i < b.length; i++) ops.push({ type: "same", item: b[i] });
  return ops;
}

export type WordPart = { type: "same" | "removed" | "added"; text: string };

/** Word-level diff of one line, keeping spaces attached to the words. */
export function diffWords(before: string, after: string): WordPart[] {
  const split = (s: string) => s.match(/\s+|[^\s]+/g) ?? [];
  const parts: WordPart[] = [];
  for (const op of diffSequences(split(before), split(after), (w) => w)) {
    const last = parts[parts.length - 1];
    if (last && last.type === op.type) last.text += op.item;
    else parts.push({ type: op.type, text: op.item });
  }
  return parts;
}

export type DiffRow =
  | { type: "same" | "added" | "removed"; line: Line }
  | { type: "changed"; line: Line; before: Line; words: WordPart[] }
  | { type: "skip"; count: number };

export type DocDiff = { rows: DiffRow[]; added: number; removed: number; changed: number };

/** Lines that are similar enough to show as one edited line rather than a removal and an addition. */
function similar(a: Line, b: Line) {
  if (a.kind !== b.kind && !(a.kind === "p" || b.kind === "p")) return false;
  if (a.text === b.text) return true; // same words, different style (e.g. paragraph → heading)
  const count = (s: string) => s.split(/\s+/).filter(Boolean).length;
  const same = diffWords(a.text, b.text)
    .filter((w) => w.type === "same")
    .reduce((n, w) => n + count(w.text), 0);
  return same / Math.max(count(a.text), count(b.text), 1) >= 0.5;
}

/** Compares two docs. Long runs of unchanged lines collapse to `skip` rows. */
export function diffDocs(before: Y.Doc, after: Y.Doc, context = 2): DocDiff {
  const ops = diffSequences(docLines(before), docLines(after), lineKey);
  const rows: DiffRow[] = [];
  let added = 0;
  let removed = 0;
  let changed = 0;
  for (let i = 0; i < ops.length; ) {
    if (ops[i].type === "same") {
      rows.push({ type: "same", line: ops[i].item });
      i++;
      continue;
    }
    // A block of removals followed by additions: pair up similar lines as "changed".
    const gone: Line[] = [];
    const fresh: Line[] = [];
    while (i < ops.length && ops[i].type === "removed") gone.push(ops[i++].item);
    while (i < ops.length && ops[i].type === "added") fresh.push(ops[i++].item);
    while (i < ops.length && ops[i].type === "removed") gone.push(ops[i++].item);
    let g = 0;
    for (let f = 0; f < fresh.length; f++) {
      const line = fresh[f];
      // Removed lines with no similar line still to come are plain removals.
      while (g < gone.length && !fresh.slice(f).some((later) => similar(gone[g], later))) {
        rows.push({ type: "removed", line: gone[g++] });
        removed++;
      }
      if (g < gone.length && similar(gone[g], line)) {
        rows.push({ type: "changed", line, before: gone[g], words: diffWords(gone[g].text, line.text) });
        changed++;
        g++;
      } else {
        rows.push({ type: "added", line });
        added++;
      }
    }
    for (; g < gone.length; g++) {
      rows.push({ type: "removed", line: gone[g] });
      removed++;
    }
  }

  if (!Number.isFinite(context)) return { rows, added, removed, changed };

  // Keep a little context around changes; fold the rest.
  const keep = rows.map((r) => r.type !== "same");
  const near = keep.map((_, idx) => {
    for (let d = -context; d <= context; d++) if (keep[idx + d]) return true;
    return false;
  });
  const folded: DiffRow[] = [];
  for (let idx = 0; idx < rows.length; idx++) {
    if (near[idx]) folded.push(rows[idx]);
    else {
      const last = folded[folded.length - 1];
      if (last?.type === "skip") last.count++;
      else folded.push({ type: "skip", count: 1 });
    }
  }
  return { rows: folded, added, removed, changed };
}

/* --------------------------------- Boards --------------------------------- */

export type BoardChange = {
  kind: "added" | "removed" | "moved" | "edited" | "column-added" | "column-removed" | "column-renamed";
  title: string;
  detail?: string;
};

type Named = { id: string; name: string };

function cardFields(card: Card, people: Map<string, string>) {
  return {
    title: card.title,
    description: card.description.trim(),
    label: card.label ?? "",
    due: card.due ?? "",
    assignees: card.assignees.map((id) => people.get(id) ?? "someone").sort().join(", "),
    checklist: card.checklist.map((i) => `${i.done ? "x" : " "}${i.text}`).join("\n"),
  };
}

const FIELD_NAMES: Record<keyof ReturnType<typeof cardFields>, string> = {
  title: "title",
  description: "description",
  label: "label",
  due: "due date",
  assignees: "assignees",
  checklist: "checklist",
};

/** What changed between two versions of a board, in plain language. */
export function diffBoards(before: Y.Doc | BoardSnapshot, after: Y.Doc | BoardSnapshot, members: Named[]) {
  const a = before instanceof Y.Doc ? readBoard(before) : before;
  const b = after instanceof Y.Doc ? readBoard(after) : after;
  const people = new Map(members.map((m) => [m.id, m.name]));
  const changes: BoardChange[] = [];

  const colsA = new Map(a.columns.map((c) => [c.id, c]));
  const colsB = new Map(b.columns.map((c) => [c.id, c]));
  for (const col of b.columns) {
    const old = colsA.get(col.id);
    if (!old) changes.push({ kind: "column-added", title: col.title || "Untitled column" });
    else if (old.title !== col.title)
      changes.push({ kind: "column-renamed", title: col.title, detail: `was “${old.title}”` });
  }
  for (const col of a.columns) {
    if (!colsB.has(col.id)) changes.push({ kind: "column-removed", title: col.title || "Untitled column" });
  }

  const cardsA = new Map(a.columns.flatMap((c) => c.cards.map((card) => [card.id, { card, column: c.title }] as const)));
  const cardsB = new Map(b.columns.flatMap((c) => c.cards.map((card) => [card.id, { card, column: c.title }] as const)));
  for (const [id, { card, column }] of cardsB) {
    const old = cardsA.get(id);
    if (!old) {
      changes.push({ kind: "added", title: card.title, detail: `in ${column}` });
      continue;
    }
    if (old.card.columnId !== card.columnId) {
      changes.push({ kind: "moved", title: card.title, detail: `${old.column} → ${column}` });
    }
    const fa = cardFields(old.card, people);
    const fb = cardFields(card, people);
    const edited = (Object.keys(fa) as (keyof typeof fa)[]).filter((k) => fa[k] !== fb[k]);
    if (edited.length) {
      changes.push({
        kind: "edited",
        title: card.title,
        detail:
          edited.includes("title") && old.card.title !== card.title
            ? `renamed from “${old.card.title}”${edited.length > 1 ? `, and ${edited.filter((k) => k !== "title").map((k) => FIELD_NAMES[k]).join(", ")} changed` : ""}`
            : `${edited.map((k) => FIELD_NAMES[k]).join(", ")} changed`,
      });
    }
  }
  for (const [id, { card, column }] of cardsA) {
    if (!cardsB.has(id)) changes.push({ kind: "removed", title: card.title, detail: `from ${column}` });
  }
  return changes;
}

/* --------------------------------- Shared --------------------------------- */

/** Rebuilds a Yjs doc from a saved update (base64). */
export function docFromBase64(base64: string | null) {
  const doc = new Y.Doc();
  if (base64) {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    Y.applyUpdate(doc, bytes);
  }
  return doc;
}

export function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** The page as it would be after merging the branch: both sides' changes kept. */
export function mergedPreview(page: Y.Doc, branch: Y.Doc) {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(page));
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(branch));
  return doc;
}
