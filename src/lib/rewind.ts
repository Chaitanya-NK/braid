import * as Y from "yjs";
import type { HistoryEntry } from "./history-actions";

/**
 * Rewind: rebuild a page at any point in its history.
 *
 * History is a list of Yjs updates. The page "at step i" is a fresh Y.Doc
 * with updates 0..i applied. Going forward just applies more updates; going
 * backward rebuilds from the nearest saved checkpoint, so scrubbing stays fast
 * on long histories.
 */

export type Step = {
  id: number;
  at: number;
  userId: string | null;
  edits: number;
  update: Uint8Array;
};

export function decodeHistory(entries: HistoryEntry[]): Step[] {
  return entries.map((e) => ({ ...e, update: base64ToBytes(e.update) }));
}

function base64ToBytes(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* -------------------------------- Chapters -------------------------------- */

export type Chapter = { start: number; end: number; at: number; until: number; userIds: string[]; edits: number };

/** A new chapter starts after 10 minutes with no edits: one per work session. */
export function chaptersOf(steps: Step[], gapMs = 10 * 60 * 1000): Chapter[] {
  const chapters: Chapter[] = [];
  steps.forEach((s, i) => {
    const current = chapters.at(-1);
    if (!current || s.at - steps[i - 1].at > gapMs) {
      chapters.push({ start: i, end: i, at: s.at, until: s.at, userIds: [], edits: 0 });
    }
    const c = chapters.at(-1)!;
    c.end = i;
    c.until = s.at;
    c.edits += s.edits;
    if (s.userId && !c.userIds.includes(s.userId)) c.userIds.push(s.userId);
  });
  return chapters;
}

/* -------------------------------- Replayer -------------------------------- */

const CHECKPOINT_EVERY = 25;

export class Replayer {
  /** The document as of `cursor` (steps 0..cursor applied). Replaced on rewind. */
  doc = new Y.Doc();
  cursor = -1;
  private checkpoints = new Map<number, Uint8Array>();

  constructor(private steps: Step[]) {}

  /**
   * Move to step `index`. Returns true if `doc` was replaced by a new
   * instance (so anything bound to the old one must re-bind).
   */
  seek(index: number): boolean {
    index = Math.max(-1, Math.min(index, this.steps.length - 1));
    if (index === this.cursor) return false;
    let replaced = false;
    if (index < this.cursor) {
      // Back to the nearest checkpoint at or before index.
      let from = -1;
      for (const k of this.checkpoints.keys()) if (k <= index && k > from) from = k;
      this.doc = new Y.Doc();
      if (from >= 0) Y.applyUpdate(this.doc, this.checkpoints.get(from)!);
      this.cursor = from;
      replaced = true;
    }
    while (this.cursor < index) {
      this.cursor++;
      Y.applyUpdate(this.doc, this.steps[this.cursor].update);
      if (this.cursor % CHECKPOINT_EVERY === 0 && !this.checkpoints.has(this.cursor)) {
        this.checkpoints.set(this.cursor, Y.encodeStateAsUpdate(this.doc));
      }
    }
    return replaced;
  }
}

/* --------------------------------- Restore -------------------------------- */

/**
 * Makes `live` look like `past`, as a normal edit everyone receives. Works
 * for docs (Tiptap's "default" fragment) and boards ("columns" and "cards"
 * maps). Because it's just another change, a restore can itself be undone
 * by rewinding to before it.
 */
export function restoreInto(live: Y.Doc, past: Y.Doc, kind: "doc" | "board") {
  live.transact(() => {
    if (kind === "doc") {
      const target = live.getXmlFragment("default");
      const source = past.getXmlFragment("default");
      target.delete(0, target.length);
      target.insert(
        0,
        source.toArray().map((node) => node.clone() as Y.XmlElement | Y.XmlText),
      );
    } else {
      for (const name of ["columns", "cards"]) {
        const target = live.getMap<unknown>(name);
        const source = past.getMap<unknown>(name);
        for (const key of [...target.keys()]) target.delete(key);
        source.forEach((value, key) => {
          target.set(key, value instanceof Y.AbstractType ? value.clone() : value);
        });
      }
    }
  }, "rewind-restore");
}
