import * as Y from "yjs";
import { boardMaps, LABELS, moveCard, readBoard, type Card, type Label } from "./board-model";

/**
 * Board automations: "When <trigger>, then <actions>".
 *
 * Shared by the rule builder (to describe rules), the Server Actions (to
 * validate them) and the sync server (to run them). Runs nothing by itself.
 */

export type Trigger =
  | { type: "card_added"; columnId: string | null } // null = any column
  | { type: "card_moved"; columnId: string }
  | { type: "checklist_completed" }
  | { type: "label_set"; label: Label };

export type Action =
  | { type: "move_to"; columnId: string }
  | { type: "set_label"; label: Label | null }
  | { type: "assign"; userId: string }
  | { type: "unassign_all" }
  | { type: "set_due"; days: number }
  | { type: "clear_due" }
  | { type: "complete_checklist" }
  | { type: "notify"; to: "assignees" | "creator" | string };

export type Rule = { id: string; name: string; enabled: boolean; trigger: Trigger; actions: Action[] };

export const TRIGGER_TYPES: { type: Trigger["type"]; label: string }[] = [
  { type: "card_added", label: "A card is added" },
  { type: "card_moved", label: "A card moves to a column" },
  { type: "checklist_completed", label: "A card's checklist is all done" },
  { type: "label_set", label: "A card gets a label" },
];

export const ACTION_TYPES: { type: Action["type"]; label: string }[] = [
  { type: "move_to", label: "Move it to a column" },
  { type: "set_label", label: "Set its label" },
  { type: "assign", label: "Assign someone" },
  { type: "unassign_all", label: "Unassign everyone" },
  { type: "set_due", label: "Set a due date" },
  { type: "clear_due", label: "Clear the due date" },
  { type: "complete_checklist", label: "Check off its checklist" },
  { type: "notify", label: "Notify someone" },
];

type Names = { columns: Map<string, string>; people: Map<string, string> };

const col = (names: Names, id: string | null) =>
  id === null ? "any column" : `“${names.columns.get(id) ?? "a deleted column"}”`;

export function describeTrigger(t: Trigger, names: Names) {
  switch (t.type) {
    case "card_added":
      return t.columnId ? `a card is added to ${col(names, t.columnId)}` : "a card is added";
    case "card_moved":
      return `a card moves to ${col(names, t.columnId)}`;
    case "checklist_completed":
      return "a card's checklist is all done";
    case "label_set":
      return `a card is labelled ${LABELS[t.label].name}`;
  }
}

export function describeAction(a: Action, names: Names) {
  switch (a.type) {
    case "move_to":
      return `move it to ${col(names, a.columnId)}`;
    case "set_label":
      return a.label ? `label it ${LABELS[a.label].name}` : "remove its label";
    case "assign":
      return `assign ${names.people.get(a.userId) ?? "someone who left"}`;
    case "unassign_all":
      return "unassign everyone";
    case "set_due":
      return a.days === 0 ? "make it due today" : `make it due in ${a.days} ${a.days === 1 ? "day" : "days"}`;
    case "clear_due":
      return "clear the due date";
    case "complete_checklist":
      return "check off its checklist";
    case "notify":
      return a.to === "assignees"
        ? "notify its assignees"
        : a.to === "creator"
          ? "notify whoever made it"
          : `notify ${names.people.get(a.to) ?? "someone who left"}`;
  }
}

const list = (parts: string[]) =>
  parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;

/** "When a card moves to “Done”, check off its checklist and notify its assignees." */
export function describeRule(rule: Pick<Rule, "trigger" | "actions">, names: Names) {
  const when = describeTrigger(rule.trigger, names);
  return `When ${when}, ${list(rule.actions.map((a) => describeAction(a, names)))}.`;
}

/* -------------------------------- Validation -------------------------------- */

const LABEL_KEYS = Object.keys(LABELS) as Label[];
const isLabel = (v: unknown): v is Label => typeof v === "string" && LABEL_KEYS.includes(v as Label);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length < 100;

/** Checks a rule from the browser. Returns a clean copy, or an error message. */
export function parseRule(input: { trigger: unknown; actions: unknown }): { trigger: Trigger; actions: Action[] } | string {
  const t = input.trigger as Record<string, unknown> | null;
  let trigger: Trigger;
  switch (t?.type) {
    case "card_added":
      if (t.columnId !== null && !isId(t.columnId)) return "Pick a column";
      trigger = { type: "card_added", columnId: (t.columnId as string | null) ?? null };
      break;
    case "card_moved":
      if (!isId(t.columnId)) return "Pick the column cards move to";
      trigger = { type: "card_moved", columnId: t.columnId };
      break;
    case "checklist_completed":
      trigger = { type: "checklist_completed" };
      break;
    case "label_set":
      if (!isLabel(t.label)) return "Pick a label";
      trigger = { type: "label_set", label: t.label };
      break;
    default:
      return "Pick what starts the rule";
  }

  if (!Array.isArray(input.actions) || input.actions.length === 0) return "Add at least one thing to do";
  if (input.actions.length > 6) return "A rule can do up to 6 things";
  const actions: Action[] = [];
  for (const raw of input.actions as Record<string, unknown>[]) {
    switch (raw?.type) {
      case "move_to":
        if (!isId(raw.columnId)) return "Pick the column to move cards to";
        if (trigger.type === "card_moved" && raw.columnId === trigger.columnId) {
          return "Moving a card to the column it just moved to does nothing";
        }
        actions.push({ type: "move_to", columnId: raw.columnId });
        break;
      case "set_label":
        if (raw.label !== null && !isLabel(raw.label)) return "Pick a label";
        actions.push({ type: "set_label", label: (raw.label as Label | null) ?? null });
        break;
      case "assign":
        if (!isId(raw.userId)) return "Pick who to assign";
        actions.push({ type: "assign", userId: raw.userId });
        break;
      case "set_due": {
        const days = Number(raw.days);
        if (!Number.isInteger(days) || days < 0 || days > 365) return "Due dates can be 0 to 365 days away";
        actions.push({ type: "set_due", days });
        break;
      }
      case "notify":
        if (!isId(raw.to)) return "Pick who to notify";
        actions.push({ type: "notify", to: raw.to });
        break;
      case "unassign_all":
      case "clear_due":
      case "complete_checklist":
        actions.push({ type: raw.type });
        break;
      default:
        return "One of the steps isn't something a rule can do";
    }
  }
  return { trigger, actions };
}

/* --------------------------------- Running --------------------------------- */

/** The parts of a card that triggers look at. */
export type CardState = { columnId: string; label: Label | null; checklistDone: boolean };
export type BoardState = Map<string, CardState>;

const allDone = (card: Card) => card.checklist.length > 0 && card.checklist.every((i) => i.done);

export function boardState(doc: Y.Doc): BoardState {
  const state: BoardState = new Map();
  for (const column of readBoard(doc).columns) {
    for (const card of column.cards) {
      state.set(card.id, { columnId: column.id, label: card.label, checklistDone: allDone(card) });
    }
  }
  return state;
}

/** Which rules fire on which cards, comparing the board before and after a change. */
export function matches(before: BoardState, doc: Y.Doc, rules: Rule[]) {
  const cards = new Map(readBoard(doc).columns.flatMap((c) => c.cards.map((card) => [card.id, { card, columnId: c.id }])));
  const fired: { rule: Rule; card: Card; columnId: string }[] = [];
  for (const [id, { card, columnId }] of cards) {
    const old = before.get(id);
    for (const rule of rules) {
      if (!rule.enabled) continue;
      const t = rule.trigger;
      const hit =
        (t.type === "card_added" && !old && (t.columnId === null || t.columnId === columnId)) ||
        (t.type === "card_moved" && old && old.columnId !== columnId && t.columnId === columnId) ||
        (t.type === "checklist_completed" && old && !old.checklistDone && allDone(card)) ||
        (t.type === "label_set" && card.label === t.label && (old ? old.label !== t.label : true));
      if (hit) fired.push({ rule, card, columnId });
    }
  }
  return fired;
}

/** yyyy-mm-dd, `days` from today (server's date). */
function dueIn(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export type Notice = { to: string[]; message: string };

/**
 * Does a rule's actions to one card, in the caller's transaction. Returns
 * anyone to notify; notifications are sent by the caller.
 */
export function applyActions(doc: Y.Doc, card: Card, actions: Action[], memberIds: Set<string>): Notice[] {
  const m = boardMaps(doc).cards.get(card.id);
  if (!m) return [];
  const notices: Notice[] = [];
  let assignees = [...card.assignees];
  for (const a of actions) {
    switch (a.type) {
      case "move_to":
        if (boardMaps(doc).columns.has(a.columnId)) moveCard(doc, card.id, a.columnId, 0);
        break;
      case "set_label":
        m.set("label", a.label);
        break;
      case "assign":
        if (memberIds.has(a.userId) && !assignees.includes(a.userId)) {
          assignees = [...assignees, a.userId];
          m.set("assignees", assignees);
        }
        break;
      case "unassign_all":
        assignees = [];
        m.set("assignees", []);
        break;
      case "set_due":
        m.set("due", dueIn(a.days));
        break;
      case "clear_due":
        m.set("due", null);
        break;
      case "complete_checklist":
        m.set(
          "checklist",
          card.checklist.map((i) => ({ ...i, done: true })),
        );
        break;
      case "notify": {
        const to = a.to === "assignees" ? assignees : a.to === "creator" ? [card.createdBy] : [a.to];
        notices.push({ to: to.filter((id) => memberIds.has(id)), message: card.title });
        break;
      }
    }
  }
  return notices;
}
