import { generateKeyBetween } from "fractional-indexing";
import * as Y from "yjs";

/**
 * A board lives in a Yjs document:
 *
 *   columns: Y.Map<columnId, Y.Map{ title, order }>
 *   cards:   Y.Map<cardId,   Y.Map{ title, columnId, order, ... }>
 *
 * Cards don't sit inside a column's list. Each card stores which column it's
 * in and a sortable "order" key (fractional indexing). Moving a card just
 * changes those two fields, so if two people move the same card at once,
 * one move wins instead of the card being duplicated.
 *
 * Shared by the browser and the sync server (which seeds new boards).
 */

export type Label = "gray" | "red" | "orange" | "green" | "blue" | "purple" | "pink";

export const LABELS: Record<Label, { name: string; bg: string; text: string }> = {
  gray: { name: "Gray", bg: "#F4F4F5", text: "#3F3F46" },
  red: { name: "Bug", bg: "#FEE2E2", text: "#991B1B" },
  orange: { name: "Urgent", bg: "#FFEDD5", text: "#9A3412" },
  green: { name: "Done-ish", bg: "#DCFCE7", text: "#166534" },
  blue: { name: "Feature", bg: "#DBEAFE", text: "#1E40AF" },
  purple: { name: "Design", bg: "#EDE9FE", text: "#5B21B6" },
  pink: { name: "Marketing", bg: "#FCE7F3", text: "#9D174D" },
};

export type ChecklistItem = { id: string; text: string; done: boolean };

export type Card = {
  id: string;
  title: string;
  columnId: string;
  order: string;
  description: string;
  label: Label | null;
  due: string | null; // yyyy-mm-dd
  assignees: string[]; // user ids
  checklist: ChecklistItem[];
  reactions: Record<string, string[]>; // emoji -> user ids
  createdBy: string;
  createdAt: number;
};

export type Column = { id: string; title: string; order: string };

export type BoardSnapshot = { columns: (Column & { cards: Card[] })[]; cardCount: number };

export const REACTIONS = ["👍", "🎉", "❤️", "👀"] as const;

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export function boardMaps(doc: Y.Doc) {
  return {
    columns: doc.getMap<Y.Map<unknown>>("columns"),
    cards: doc.getMap<Y.Map<unknown>>("cards"),
  };
}

const byOrder = <T extends { order: string; id: string }>(a: T, b: T) =>
  a.order < b.order ? -1 : a.order > b.order ? 1 : a.id < b.id ? -1 : 1;

function readCard(id: string, m: Y.Map<unknown>): Card {
  return {
    id,
    title: String(m.get("title") ?? ""),
    columnId: String(m.get("columnId") ?? ""),
    order: String(m.get("order") ?? "a0"),
    description: String(m.get("description") ?? ""),
    label: (m.get("label") as Label | null) ?? null,
    due: (m.get("due") as string | null) ?? null,
    assignees: (m.get("assignees") as string[] | undefined) ?? [],
    checklist: (m.get("checklist") as ChecklistItem[] | undefined) ?? [],
    reactions: (m.get("reactions") as Record<string, string[]> | undefined) ?? {},
    createdBy: String(m.get("createdBy") ?? ""),
    createdAt: Number(m.get("createdAt") ?? 0),
  };
}

/** Plain-object copy of the board, sorted, for rendering. */
export function readBoard(doc: Y.Doc): BoardSnapshot {
  const { columns, cards } = boardMaps(doc);
  const cols: (Column & { cards: Card[] })[] = [];
  columns.forEach((m, id) => {
    cols.push({ id, title: String(m.get("title") ?? ""), order: String(m.get("order") ?? "a0"), cards: [] });
  });
  cols.sort(byOrder);
  const index = new Map(cols.map((c) => [c.id, c]));
  let cardCount = 0;
  cards.forEach((m, id) => {
    const card = readCard(id, m);
    // A card whose column was deleted by someone else falls into the first column.
    const col = index.get(card.columnId) ?? cols[0];
    if (col) {
      col.cards.push(card);
      cardCount++;
    }
  });
  cols.forEach((c) => c.cards.sort(byOrder));
  return { columns: cols, cardCount };
}

/** Order key that places an item between two neighbours (either may be missing). */
function keyBetween(before?: string, after?: string) {
  try {
    return generateKeyBetween(before ?? null, after ?? null);
  } catch {
    // Neighbours out of order (can briefly happen mid-sync): put it at the end.
    return generateKeyBetween(after ?? before ?? null, null);
  }
}

/* --------------------------------- Columns -------------------------------- */

export function addColumn(doc: Y.Doc, title: string) {
  const board = readBoard(doc);
  const last = board.columns.at(-1)?.order;
  const id = newId();
  doc.transact(() => {
    const m = new Y.Map<unknown>();
    m.set("title", title);
    m.set("order", keyBetween(last));
    boardMaps(doc).columns.set(id, m);
  });
  return id;
}

export function renameColumn(doc: Y.Doc, columnId: string, title: string) {
  boardMaps(doc).columns.get(columnId)?.set("title", title);
}

/** Deletes a column and its cards. */
export function deleteColumn(doc: Y.Doc, columnId: string) {
  const { columns, cards } = boardMaps(doc);
  doc.transact(() => {
    cards.forEach((m, id) => {
      if (m.get("columnId") === columnId) cards.delete(id);
    });
    columns.delete(columnId);
  });
}

export function moveColumn(doc: Y.Doc, columnId: string, toIndex: number) {
  const others = readBoard(doc).columns.filter((c) => c.id !== columnId);
  const order = keyBetween(others[toIndex - 1]?.order, others[toIndex]?.order);
  boardMaps(doc).columns.get(columnId)?.set("order", order);
}

/* ---------------------------------- Cards --------------------------------- */

export function addCard(doc: Y.Doc, columnId: string, title: string, userId: string) {
  const col = readBoard(doc).columns.find((c) => c.id === columnId);
  const last = col?.cards.at(-1)?.order;
  const id = newId();
  doc.transact(() => {
    const m = new Y.Map<unknown>();
    m.set("title", title);
    m.set("columnId", columnId);
    m.set("order", keyBetween(last));
    m.set("description", "");
    m.set("label", null);
    m.set("due", null);
    m.set("assignees", []);
    m.set("checklist", []);
    m.set("reactions", {});
    m.set("createdBy", userId);
    m.set("createdAt", Date.now());
    boardMaps(doc).cards.set(id, m);
  });
  return id;
}

type EditableCardFields = Partial<
  Pick<Card, "title" | "description" | "label" | "due" | "assignees" | "checklist" | "reactions">
>;

export function updateCard(doc: Y.Doc, cardId: string, fields: EditableCardFields) {
  const m = boardMaps(doc).cards.get(cardId);
  if (!m) return;
  doc.transact(() => {
    for (const [key, value] of Object.entries(fields)) m.set(key, value);
  });
}

export function deleteCard(doc: Y.Doc, cardId: string) {
  boardMaps(doc).cards.delete(cardId);
}

/** Puts a deleted card back exactly as it was (used by Undo). */
export function restoreCard(doc: Y.Doc, card: Card) {
  const { id, ...fields } = card;
  doc.transact(() => {
    const m = new Y.Map<unknown>();
    for (const [key, value] of Object.entries(fields)) m.set(key, value);
    boardMaps(doc).cards.set(id, m);
  });
}

/**
 * Moves a card into `columnId` at position `toIndex` (0 = top), counted
 * among the column's other cards.
 */
export function moveCard(doc: Y.Doc, cardId: string, columnId: string, toIndex: number) {
  const board = readBoard(doc);
  const col = board.columns.find((c) => c.id === columnId);
  if (!col) return;
  const others = col.cards.filter((c) => c.id !== cardId);
  const order = keyBetween(others[toIndex - 1]?.order, others[toIndex]?.order);
  const m = boardMaps(doc).cards.get(cardId);
  if (!m) return;
  doc.transact(() => {
    m.set("columnId", columnId);
    m.set("order", order);
  });
}

export function toggleReaction(doc: Y.Doc, cardId: string, emoji: string, userId: string) {
  const m = boardMaps(doc).cards.get(cardId);
  if (!m) return;
  const reactions = { ...((m.get("reactions") as Record<string, string[]>) ?? {}) };
  const users = new Set(reactions[emoji] ?? []);
  if (users.has(userId)) users.delete(userId);
  else users.add(userId);
  if (users.size) reactions[emoji] = [...users];
  else delete reactions[emoji];
  m.set("reactions", reactions);
}

export function checklistItem(text: string): ChecklistItem {
  return { id: newId(), text, done: false };
}

/** A brand-new board starts with three columns. Run once, by the sync server. */
export function seedBoard(doc: Y.Doc) {
  const { columns, cards } = boardMaps(doc);
  if (columns.size > 0 || cards.size > 0) return false;
  doc.transact(() => {
    let prev: string | undefined;
    for (const title of ["To do", "In progress", "Done"]) {
      const m = new Y.Map<unknown>();
      prev = keyBetween(prev);
      m.set("title", title);
      m.set("order", prev);
      columns.set(newId(), m);
    }
  });
  return true;
}
