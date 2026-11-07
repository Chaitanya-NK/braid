import { generateKeyBetween } from "fractional-indexing";
import * as Y from "yjs";
import type { BoardChange } from "./branch-diff";

/**
 * A canvas: an infinite whiteboard of shapes, stored in a Yjs document as
 * one map, `shapes`, of shape id → Y.Map of fields. Like board cards, each
 * shape is its own map, so two people moving different shapes never clash,
 * and two people moving the same shape end with one of their moves.
 *
 * Shared by the canvas, Rewind, branch review and recaps.
 */

export type ShapeType = "sticky" | "rect" | "ellipse" | "text" | "arrow" | "pen";

export type Shape = {
  id: string;
  type: ShapeType;
  /** Top-left corner, in canvas units. For arrows: the start point. */
  x: number;
  y: number;
  /** Size. For arrows: the end point relative to the start. */
  w: number;
  h: number;
  color: string;
  text: string;
  /** Pen strokes: [x0, y0, x1, y1, …] relative to (x, y). */
  points: number[];
  /** Arrows can be stuck to shapes at either end. */
  from: string | null;
  to: string | null;
  order: string;
  createdBy: string;
};

export const STICKY_COLORS = ["#FEF08A", "#FBCFE8", "#BFDBFE", "#BBF7D0", "#DDD6FE", "#FED7AA"];
export const INK_COLORS = ["#18181B", "#0F766E", "#2563EB", "#DC2626", "#9333EA", "#EA580C"];

export const SHAPE_NAMES: Record<ShapeType, string> = {
  sticky: "Sticky note",
  rect: "Rectangle",
  ellipse: "Ellipse",
  text: "Text",
  arrow: "Arrow",
  pen: "Drawing",
};

export const DEFAULT_SIZE: Record<ShapeType, { w: number; h: number }> = {
  sticky: { w: 180, h: 160 },
  rect: { w: 200, h: 120 },
  ellipse: { w: 160, h: 120 },
  text: { w: 240, h: 40 },
  arrow: { w: 160, h: 0 },
  pen: { w: 0, h: 0 },
};

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export const shapesMap = (doc: Y.Doc) => doc.getMap<Y.Map<unknown>>("shapes");

function readShape(id: string, m: Y.Map<unknown>): Shape {
  return {
    id,
    type: (m.get("type") as ShapeType) ?? "rect",
    x: Number(m.get("x") ?? 0),
    y: Number(m.get("y") ?? 0),
    w: Number(m.get("w") ?? 0),
    h: Number(m.get("h") ?? 0),
    color: String(m.get("color") ?? INK_COLORS[0]),
    text: String(m.get("text") ?? ""),
    points: (m.get("points") as number[] | undefined) ?? [],
    from: (m.get("from") as string | null) ?? null,
    to: (m.get("to") as string | null) ?? null,
    order: String(m.get("order") ?? "a0"),
    createdBy: String(m.get("createdBy") ?? ""),
  };
}

/** All shapes, back to front. */
export function readCanvas(doc: Y.Doc): Shape[] {
  const shapes: Shape[] = [];
  shapesMap(doc).forEach((m, id) => shapes.push(readShape(id, m)));
  return shapes.sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : a.id < b.id ? -1 : 1));
}

function topOrder(doc: Y.Doc) {
  let top: string | null = null;
  shapesMap(doc).forEach((m) => {
    const o = String(m.get("order") ?? "a0");
    if (top === null || o > top) top = o;
  });
  try {
    return generateKeyBetween(top, null);
  } catch {
    return generateKeyBetween(null, null);
  }
}

export type NewShape = Partial<Omit<Shape, "id" | "order">> & { type: ShapeType; x: number; y: number };

export function addShape(doc: Y.Doc, shape: NewShape, userId: string) {
  const id = newId();
  const size = DEFAULT_SIZE[shape.type];
  const m = new Y.Map<unknown>();
  doc.transact(() => {
    m.set("type", shape.type);
    m.set("x", Math.round(shape.x));
    m.set("y", Math.round(shape.y));
    m.set("w", Math.round(shape.w ?? size.w));
    m.set("h", Math.round(shape.h ?? size.h));
    m.set("color", shape.color ?? (shape.type === "sticky" ? STICKY_COLORS[0] : INK_COLORS[0]));
    m.set("text", shape.text ?? "");
    m.set("points", shape.points ?? []);
    m.set("from", shape.from ?? null);
    m.set("to", shape.to ?? null);
    m.set("order", topOrder(doc));
    m.set("createdBy", userId);
    shapesMap(doc).set(id, m);
  });
  return id;
}

export type ShapeFields = Partial<Pick<Shape, "x" | "y" | "w" | "h" | "color" | "text" | "points" | "from" | "to">>;

export function updateShape(doc: Y.Doc, id: string, fields: ShapeFields) {
  const m = shapesMap(doc).get(id);
  if (!m) return;
  doc.transact(() => {
    for (const [key, value] of Object.entries(fields)) {
      m.set(key, typeof value === "number" ? Math.round(value) : value);
    }
  });
}

/** Moves shapes by (dx, dy) from where they were at `start`. */
export function moveShapes(doc: Y.Doc, start: Map<string, { x: number; y: number }>, dx: number, dy: number) {
  doc.transact(() => {
    for (const [id, p] of start) {
      const m = shapesMap(doc).get(id);
      if (!m) continue;
      m.set("x", Math.round(p.x + dx));
      m.set("y", Math.round(p.y + dy));
    }
  });
}

/** Deletes shapes, and any arrows stuck to them. */
export function deleteShapes(doc: Y.Doc, ids: Iterable<string>) {
  const gone = new Set(ids);
  const map = shapesMap(doc);
  const doomed: string[] = [];
  map.forEach((m, id) => {
    if (gone.has(id) || gone.has(m.get("from") as string) || gone.has(m.get("to") as string)) doomed.push(id);
  });
  doc.transact(() => doomed.forEach((id) => map.delete(id)));
}

/** Copies shapes, a little down and to the right. Returns the new ids. */
export function duplicateShapes(doc: Y.Doc, ids: Iterable<string>, userId: string) {
  const out: string[] = [];
  doc.transact(() => {
    for (const shape of readCanvas(doc).filter((s) => [...ids].includes(s.id))) {
      const copy: NewShape = {
        type: shape.type,
        x: shape.x + 24,
        y: shape.y + 24,
        w: shape.w,
        h: shape.h,
        color: shape.color,
        text: shape.text,
        points: shape.points,
      };
      out.push(addShape(doc, copy, userId));
    }
  });
  return out;
}

export function bringToFront(doc: Y.Doc, ids: Iterable<string>) {
  doc.transact(() => {
    for (const id of ids) shapesMap(doc).get(id)?.set("order", topOrder(doc));
  });
}

/* --------------------------------- Geometry -------------------------------- */

export type Box = { x: number; y: number; w: number; h: number };

/** A shape's bounding box (arrows and pen strokes included). */
export function boxOf(shape: Shape, all?: Map<string, Shape>): Box {
  if (shape.type === "arrow") {
    const [a, b] = arrowEnds(shape, all);
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
  }
  if (shape.type === "pen") {
    const xs = shape.points.filter((_, i) => i % 2 === 0);
    const ys = shape.points.filter((_, i) => i % 2 === 1);
    if (xs.length === 0) return { x: shape.x, y: shape.y, w: 0, h: 0 };
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return { x: shape.x + minX, y: shape.y + minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
  }
  return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
}

const center = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** Where a line from a box's centre towards `toward` leaves the box. */
function edgePoint(b: Box, toward: { x: number; y: number }) {
  const c = center(b);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const sx = dx === 0 ? Infinity : b.w / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : b.h / 2 / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: c.x + dx * s, y: c.y + dy * s };
}

/** An arrow's two ends, following the shapes it's stuck to. */
export function arrowEnds(arrow: Shape, all?: Map<string, Shape>) {
  let a = { x: arrow.x, y: arrow.y };
  let b = { x: arrow.x + arrow.w, y: arrow.y + arrow.h };
  const fromShape = arrow.from ? all?.get(arrow.from) : undefined;
  const toShape = arrow.to ? all?.get(arrow.to) : undefined;
  if (fromShape && fromShape.type !== "arrow") a = center(boxOf(fromShape));
  if (toShape && toShape.type !== "arrow") b = center(boxOf(toShape));
  if (fromShape && fromShape.type !== "arrow") a = edgePoint(boxOf(fromShape), b);
  if (toShape && toShape.type !== "arrow") b = edgePoint(boxOf(toShape), a);
  return [a, b] as const;
}

/** The box around a set of shapes, or null if there are none. */
export function boundsOf(shapes: Shape[]): Box | null {
  if (shapes.length === 0) return null;
  const all = new Map(shapes.map((s) => [s.id, s]));
  const boxes = shapes.map((s) => boxOf(s, all));
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    w: Math.max(...boxes.map((b) => b.x + b.w)) - x,
    h: Math.max(...boxes.map((b) => b.y + b.h)) - y,
  };
}

/** The top-most shape at a canvas point, if any. */
export function shapeAt(shapes: Shape[], p: { x: number; y: number }, slop = 6): Shape | null {
  const all = new Map(shapes.map((s) => [s.id, s]));
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    if (s.type === "arrow") {
      const [a, b] = arrowEnds(s, all);
      if (distanceToSegment(p, a, b) <= slop + 2) return s;
      continue;
    }
    const box = boxOf(s, all);
    if (p.x >= box.x - slop && p.x <= box.x + box.w + slop && p.y >= box.y - slop && p.y <= box.y + box.h + slop) {
      return s;
    }
  }
  return null;
}

function distanceToSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/* ----------------------------------- Diff ---------------------------------- */

const labelOf = (s: Shape) => {
  const text = s.text.trim().split("\n")[0];
  return text ? text.slice(0, 60) : SHAPE_NAMES[s.type];
};

/** What changed between two versions of a canvas, in the same plain-language form as boards. */
export function diffCanvases(before: Y.Doc, after: Y.Doc): BoardChange[] {
  const a = new Map(readCanvas(before).map((s) => [s.id, s]));
  const b = readCanvas(after);
  const changes: BoardChange[] = [];
  for (const s of b) {
    const old = a.get(s.id);
    if (!old) {
      changes.push({
        kind: "added",
        title: labelOf(s),
        detail: s.text.trim() ? SHAPE_NAMES[s.type].toLowerCase() : undefined,
      });
      continue;
    }
    const edits: string[] = [];
    if (old.text !== s.text) edits.push(old.text.trim() ? `text was “${labelOf(old)}”` : "text added");
    if (old.color !== s.color) edits.push("colour");
    if (old.w !== s.w || old.h !== s.h || old.points.join() !== s.points.join()) edits.push("size");
    if (old.from !== s.from || old.to !== s.to) edits.push("connections");
    if (edits.length) changes.push({ kind: "edited", title: labelOf(s), detail: edits.join(", ") });
    else if (old.x !== s.x || old.y !== s.y) changes.push({ kind: "moved", title: labelOf(s) });
  }
  const now = new Set(b.map((s) => s.id));
  for (const [id, s] of a) if (!now.has(id)) changes.push({ kind: "removed", title: labelOf(s) });
  return changes;
}
