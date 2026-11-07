"use client";

import {
  ArrowUpRight,
  BringToFront,
  Circle,
  Copy,
  Hand,
  Maximize,
  Minus,
  MousePointer2,
  Pencil,
  Plus,
  Redo2,
  Square,
  StickyNote,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import * as Y from "yjs";
import { FollowFrame, useBroadcastView, useFollow, type View } from "@/components/collab/follow";
import { usePublishCollab } from "@/components/collab/page-collab-store";
import { Presence, SyncBadge, useConnectionToasts } from "@/components/collab/status";
import { useCollab, usePendingChanges, useSyncState, type Collab } from "@/components/collab/use-collab";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  addShape,
  boundsOf,
  boxOf,
  bringToFront,
  deleteShapes,
  duplicateShapes,
  INK_COLORS,
  moveShapes,
  readCanvas,
  shapeAt,
  shapesMap,
  STICKY_COLORS,
  updateShape,
  type Box,
  type Shape,
  type ShapeType,
} from "@/lib/canvas-model";
import { cn } from "@/lib/utils";
import { CanvasShapes } from "./canvas-scene";

type Member = { id: string; name: string; color: string };
type Tool = "select" | "hand" | ShapeType;
type Point = { x: number; y: number };
type Camera = { x: number; y: number; zoom: number };

const TOOLS: { tool: Tool; label: string; key: string; icon: typeof Square }[] = [
  { tool: "select", label: "Select", key: "v", icon: MousePointer2 },
  { tool: "hand", label: "Pan", key: "h", icon: Hand },
  { tool: "sticky", label: "Sticky note", key: "n", icon: StickyNote },
  { tool: "rect", label: "Rectangle", key: "r", icon: Square },
  { tool: "ellipse", label: "Ellipse", key: "o", icon: Circle },
  { tool: "text", label: "Text", key: "t", icon: Type },
  { tool: "arrow", label: "Arrow", key: "a", icon: ArrowUpRight },
  { tool: "pen", label: "Pen", key: "p", icon: Pencil },
];

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/** A live, multiplayer whiteboard. */
export function CanvasView({
  pageId,
  branchId = null,
  me,
  readOnly,
}: {
  pageId: string;
  branchId?: string | null;
  me: Member;
  readOnly: boolean;
}) {
  const collab = useCollab(
    pageId,
    me.id,
    () =>
      toast.error("Couldn't open this canvas", {
        description: "You may no longer have access, or your session expired. Try reloading.",
        id: "canvas-access",
      }),
    branchId,
  );
  usePublishCollab(branchId ? `branch:${branchId}` : pageId, collab);
  if (!collab) return <Skeleton className="m-6 flex-1 rounded-xl" aria-busy="true" />;
  return <LiveCanvas collab={collab} me={me} readOnly={readOnly} />;
}

/** Re-reads the shapes whenever they change (including deletions). */
function useShapes(doc: Y.Doc) {
  const version = useSyncExternalStore(
    (notify) => {
      const map = shapesMap(doc);
      const bump = () => {
        versions.set(doc, (versions.get(doc) ?? 0) + 1);
        notify();
      };
      map.observeDeep(bump);
      return () => map.unobserveDeep(bump);
    },
    () => versions.get(doc) ?? 0,
    () => 0,
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => readCanvas(doc), [doc, version]);
}
/** A change counter per document. */
const versions = new WeakMap<Y.Doc, number>();

type PeerState = {
  clientId: number;
  user: { id?: string; name: string; color: string };
  pointer?: Point | null;
  selection?: string[];
};

function usePeers(collab: Collab) {
  const { provider } = collab;
  const snapshot = useSyncExternalStore(
    (notify) => {
      provider.awareness?.on("change", notify);
      return () => provider.awareness?.off("change", notify);
    },
    () => {
      const awareness = provider.awareness;
      if (!awareness) return "[]";
      const peers: PeerState[] = [];
      awareness.getStates().forEach((s, clientId) => {
        if (clientId === awareness.clientID || !s.user) return;
        peers.push({ clientId, user: s.user, pointer: s.pointer ?? null, selection: s.selection ?? [] });
      });
      return JSON.stringify(peers.sort((a, b) => a.clientId - b.clientId));
    },
    () => "[]",
  );
  return useMemo(() => JSON.parse(snapshot) as PeerState[], [snapshot]);
}

type Gesture =
  | { kind: "pan"; start: Point; cam: Camera }
  | { kind: "move"; start: Point; starts: Map<string, Point>; moved: boolean }
  | { kind: "resize"; id: string; start: Point; box: Box }
  | { kind: "create"; id: string; start: Point }
  | { kind: "arrow"; id: string; from: string | null }
  | { kind: "pen"; id: string; origin: Point; points: number[] }
  | { kind: "marquee"; start: Point; now: Point; additive: Set<string> };

function LiveCanvas({ collab, me, readOnly }: { collab: Collab; me: Member; readOnly: boolean }) {
  const { doc, provider, tracker } = collab;
  const sync = useSyncState(provider);
  const pending = usePendingChanges(tracker);
  useConnectionToasts(sync, tracker);
  const shapes = useShapes(doc);
  const all = useMemo(() => new Map(shapes.map((s) => [s.id, s])), [shapes]);
  const peers = usePeers(collab);

  const svgRef = useRef<SVGSVGElement>(null);
  const [cam, setCam] = useState<Camera>({ x: -80, y: -60, zoom: 1 });
  const camRef = useRef(cam);
  useEffect(() => {
    camRef.current = cam;
  }, [cam]);
  const [tool, setTool] = useState<Tool>("select");
  const [selected, setSelectedState] = useState<Set<string>>(new Set());
  // Kept in a ref too, so a key pressed right after a click acts on the new selection.
  const selectedRef = useRef(selected);
  const setSelected = useCallback((next: Set<string>) => {
    selectedRef.current = next;
    setSelectedState(next);
  }, []);
  const [editing, setEditing] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const spaceDown = useRef(false);
  // Undo covers my own changes only. It cleans itself up when the document is destroyed.
  const [undo] = useState(() => new Y.UndoManager(shapesMap(doc), { captureTimeout: 400 }));

  // Drop selected shapes that someone else deleted.
  const visibleSelection = useMemo(() => new Set([...selected].filter((id) => all.has(id))), [selected, all]);

  // Share my name, pointer and selection.
  useEffect(() => {
    provider.awareness?.setLocalStateField("user", me);
  }, [provider, me]);
  useEffect(() => {
    provider.awareness?.setLocalStateField("selection", [...visibleSelection]);
  }, [provider, visibleSelection]);

  /* ------------------------------ Coordinates ------------------------------ */

  const toCanvas = useCallback((clientX: number, clientY: number): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    const c = camRef.current;
    return { x: (clientX - rect.left) / c.zoom + c.x, y: (clientY - rect.top) / c.zoom + c.y };
  }, []);
  const toScreen = (p: Point) => ({ x: (p.x - cam.x) * cam.zoom, y: (p.y - cam.y) * cam.zoom });

  const zoomAt = useCallback((factor: number, screen?: Point) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const at = screen ?? { x: rect.width / 2, y: rect.height / 2 };
    setCam((c) => {
      const zoom = clampZoom(c.zoom * factor);
      const px = at.x / c.zoom + c.x;
      const py = at.y / c.zoom + c.y;
      return { zoom, x: px - at.x / zoom, y: py - at.y / zoom };
    });
  }, []);

  const fit = useCallback(() => {
    const svg = svgRef.current;
    const box = boundsOf(readCanvas(doc));
    if (!svg || !box) return setCam({ x: -80, y: -60, zoom: 1 });
    const rect = svg.getBoundingClientRect();
    const zoom = clampZoom(
      Math.min(1.5, (rect.width - 120) / Math.max(box.w, 1), (rect.height - 120) / Math.max(box.h, 1)),
    );
    setCam({ zoom, x: box.x + box.w / 2 - rect.width / 2 / zoom, y: box.y + box.h / 2 - rect.height / 2 / zoom });
  }, [doc]);

  // Start zoomed to fit what's there.
  const fitted = useRef(false);
  useEffect(() => {
    if (!fitted.current && shapes.length > 0) {
      fitted.current = true;
      fit();
    }
  }, [shapes.length, fit]);

  // Wheel: scroll pans, Ctrl/⌘ + scroll (and pinch) zooms. Needs a non-passive listener.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const rect = svg.getBoundingClientRect();
        zoomAt(Math.exp(-e.deltaY * 0.01), { x: e.clientX - rect.left, y: e.clientY - rect.top });
      } else {
        setCam((c) => ({ ...c, x: c.x + e.deltaX / c.zoom, y: c.y + e.deltaY / c.zoom }));
      }
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  /* ------------------------------ Follow mode ------------------------------ */

  const readView = (): View | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const c = camRef.current;
    return { kind: "canvas", x: c.x + rect.width / 2 / c.zoom, y: c.y + rect.height / 2 / c.zoom, zoom: c.zoom };
  };
  useBroadcastView(provider, readView, [cam]);
  const { leader, follow, stop } = useFollow(provider, (view) => {
    const svg = svgRef.current;
    if (!svg || view.kind !== "canvas") return;
    const rect = svg.getBoundingClientRect();
    setCam({ zoom: view.zoom, x: view.x - rect.width / 2 / view.zoom, y: view.y - rect.height / 2 / view.zoom });
  });

  /* -------------------------------- Pointer -------------------------------- */

  const canEdit = !readOnly;

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    // Keep the browser from moving focus (it would take it from a text box we're about to open).
    e.preventDefault();
    // Each drag, drawing or new shape is its own undo step, however quickly they follow each other.
    undo.stopCapturing();
    if (editing) setEditing(null);
    svgRef.current?.setPointerCapture(e.pointerId);
    const p = toCanvas(e.clientX, e.clientY);
    const panning = tool === "hand" || spaceDown.current || e.button === 1 || (readOnly && tool !== "select");
    if (panning || (readOnly && !shapeAt(shapes, p))) {
      gesture.current = { kind: "pan", start: { x: e.clientX, y: e.clientY }, cam };
      return;
    }
    if (tool === "select") {
      const hit = shapeAt(shapes, p);
      if (!hit) {
        if (!e.shiftKey) setSelected(new Set());
        gesture.current = {
          kind: "marquee",
          start: p,
          now: p,
          additive: e.shiftKey ? new Set(visibleSelection) : new Set(),
        };
        return;
      }
      let next = new Set(visibleSelection);
      if (e.shiftKey) {
        if (next.has(hit.id)) next.delete(hit.id);
        else next.add(hit.id);
      } else if (!next.has(hit.id)) {
        next = new Set([hit.id]);
      }
      setSelected(next);
      if (!canEdit) return;
      const starts = new Map<string, Point>();
      for (const id of next) {
        const s = all.get(id);
        if (s && !(s.type === "arrow" && (s.from || s.to))) starts.set(id, { x: s.x, y: s.y });
      }
      gesture.current = { kind: "move", start: p, starts, moved: false };
      return;
    }
    if (!canEdit) return;
    if (tool === "sticky" || tool === "text") {
      const size = tool === "sticky" ? { w: 180, h: 160 } : { w: 240, h: 40 };
      const id = addShape(
        doc,
        { type: tool, x: p.x - size.w / 2, y: p.y - (tool === "text" ? 20 : size.h / 2), ...size },
        me.id,
      );
      setSelected(new Set([id]));
      setEditing(id);
      setTool("select");
      return;
    }
    if (tool === "rect" || tool === "ellipse") {
      const id = addShape(doc, { type: tool, x: p.x, y: p.y, w: 1, h: 1 }, me.id);
      gesture.current = { kind: "create", id, start: p };
      setSelected(new Set([id]));
      return;
    }
    if (tool === "arrow") {
      const target = shapeAt(shapes, p);
      const from = target && target.type !== "arrow" && target.type !== "pen" ? target.id : null;
      const id = addShape(doc, { type: "arrow", x: p.x, y: p.y, w: 0, h: 0, from }, me.id);
      gesture.current = { kind: "arrow", id, from };
      return;
    }
    if (tool === "pen") {
      const id = addShape(doc, { type: "pen", x: p.x, y: p.y, w: 0, h: 0, points: [0, 0] }, me.id);
      gesture.current = { kind: "pen", id, origin: p, points: [0, 0] };
    }
  }

  const frame = useRef(0);
  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const p = toCanvas(e.clientX, e.clientY);
    provider.awareness?.setLocalStateField("pointer", p);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pan") {
      setCam({
        ...g.cam,
        x: g.cam.x - (e.clientX - g.start.x) / g.cam.zoom,
        y: g.cam.y - (e.clientY - g.start.y) / g.cam.zoom,
      });
      return;
    }
    if (g.kind === "marquee") {
      g.now = p;
      const box = {
        x: Math.min(g.start.x, p.x),
        y: Math.min(g.start.y, p.y),
        w: Math.abs(p.x - g.start.x),
        h: Math.abs(p.y - g.start.y),
      };
      setMarquee(box);
      const inside = shapes.filter((s) => {
        const b = boxOf(s, all);
        return b.x < box.x + box.w && b.x + b.w > box.x && b.y < box.y + box.h && b.y + b.h > box.y;
      });
      setSelected(new Set([...g.additive, ...inside.map((s) => s.id)]));
      return;
    }
    // Shape changes: at most once a frame.
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      if (g.kind === "move") {
        const dx = p.x - g.start.x;
        const dy = p.y - g.start.y;
        if (!g.moved && Math.hypot(dx, dy) < 3 / camRef.current.zoom) return;
        g.moved = true;
        moveShapes(doc, g.starts, dx, dy);
      } else if (g.kind === "resize") {
        updateShape(doc, g.id, {
          w: Math.max(24, g.box.w + p.x - g.start.x),
          h: Math.max(24, g.box.h + p.y - g.start.y),
        });
      } else if (g.kind === "create") {
        updateShape(doc, g.id, {
          x: Math.min(g.start.x, p.x),
          y: Math.min(g.start.y, p.y),
          w: Math.max(1, Math.abs(p.x - g.start.x)),
          h: Math.max(1, Math.abs(p.y - g.start.y)),
        });
      } else if (g.kind === "arrow") {
        const s = all.get(g.id) ?? readCanvas(doc).find((x) => x.id === g.id);
        if (s) updateShape(doc, g.id, { w: p.x - s.x, h: p.y - s.y });
      } else if (g.kind === "pen") {
        g.points.push(Math.round(p.x - g.origin.x), Math.round(p.y - g.origin.y));
        updateShape(doc, g.id, { points: [...g.points] });
      }
    });
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const g = gesture.current;
    gesture.current = null;
    cancelAnimationFrame(frame.current);
    setMarquee(null);
    if (!g) return;
    const p = toCanvas(e.clientX, e.clientY);
    if (g.kind === "create") {
      // A click (not a drag) makes a shape of the usual size.
      if (Math.hypot(p.x - g.start.x, p.y - g.start.y) < 6) {
        updateShape(doc, g.id, { x: g.start.x - 80, y: g.start.y - 50, w: 160, h: 100 });
      }
      setTool("select");
    } else if (g.kind === "arrow") {
      const target = shapeAt(
        shapes.filter((s) => s.id !== g.id && s.id !== g.from && s.type !== "arrow" && s.type !== "pen"),
        p,
      );
      const s = readCanvas(doc).find((x) => x.id === g.id);
      if (s && !target && Math.hypot(s.w, s.h) < 8) {
        deleteShapes(doc, [g.id]); // a stray click
      } else {
        updateShape(doc, g.id, { to: target?.id ?? null, w: p.x - (s?.x ?? p.x), h: p.y - (s?.y ?? p.y) });
        setSelected(new Set([g.id]));
      }
      setTool("select");
    } else if (g.kind === "pen") {
      updateShape(doc, g.id, { points: [...g.points] });
    }
  }

  function onDoubleClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!canEdit) return;
    undo.stopCapturing();
    const p = toCanvas(e.clientX, e.clientY);
    const hit = shapeAt(shapes, p);
    if (hit && hit.type !== "arrow" && hit.type !== "pen") {
      setSelected(new Set([hit.id]));
      setEditing(hit.id);
    } else if (!hit) {
      const id = addShape(doc, { type: "sticky", x: p.x - 90, y: p.y - 80 }, me.id);
      setSelected(new Set([id]));
      setEditing(id);
    }
  }

  /* ------------------------------- Keyboard -------------------------------- */

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const now = new Map(readCanvas(doc).map((x) => [x.id, x]));
      const visibleSelection = new Set([...selectedRef.current].filter((id) => now.has(id)));
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable=true], [role=dialog]")) return;
      if (e.key === " ") {
        spaceDown.current = true;
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (!canEdit) return;
        if (e.shiftKey) undo.redo();
        else undo.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        if (canEdit) undo.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (canEdit && visibleSelection.size) {
          undo.stopCapturing();
          setSelected(new Set(duplicateShapes(doc, visibleSelection, me.id)));
        }
        return;
      }
      if (mod && (e.key === "=" || e.key === "+")) return void (e.preventDefault(), zoomAt(1.2));
      if (mod && e.key === "-") return void (e.preventDefault(), zoomAt(1 / 1.2));
      if (mod || e.altKey) return;
      if ((e.key === "Delete" || e.key === "Backspace") && visibleSelection.size && canEdit) {
        e.preventDefault();
        undo.stopCapturing();
        deleteShapes(doc, visibleSelection);
        setSelected(new Set());
        return;
      }
      if (e.key === "Escape") {
        setSelected(new Set());
        setTool("select");
        return;
      }
      if (e.key === "Enter" && visibleSelection.size === 1 && canEdit) {
        const id = [...visibleSelection][0];
        const s = now.get(id);
        if (s && s.type !== "arrow" && s.type !== "pen") {
          e.preventDefault();
          setEditing(id);
        }
        return;
      }
      if (e.key.startsWith("Arrow") && visibleSelection.size && canEdit) {
        e.preventDefault();
        const step = e.shiftKey ? 20 : 2;
        const starts = new Map(
          [...visibleSelection].flatMap((id) => {
            const s = now.get(id);
            return s ? [[id, { x: s.x, y: s.y }] as const] : [];
          }),
        );
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
        if (d) moveShapes(doc, starts, d[0], d[1]);
        return;
      }
      const t = TOOLS.find((x) => x.key === e.key.toLowerCase());
      if (t && (canEdit || t.tool === "select" || t.tool === "hand")) setTool(t.tool);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") spaceDown.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [doc, undo, canEdit, me.id, zoomAt, setSelected]);

  /* -------------------------------- Render -------------------------------- */

  const editingShape = editing ? (all.get(editing) ?? null) : null;
  const single = visibleSelection.size === 1 ? all.get([...visibleSelection][0]) : undefined;
  const resizable = single && single.type !== "arrow" && single.type !== "pen" && canEdit;
  const selectedShapes = [...visibleSelection].map((id) => all.get(id)).filter(Boolean) as Shape[];
  const palette = selectedShapes.every((s) => s.type === "sticky") ? STICKY_COLORS : INK_COLORS;
  const dotSize = 20 * cam.zoom;
  const cursor = tool === "hand" ? "grab" : tool === "select" ? "default" : tool === "text" ? "text" : "crosshair";

  return (
    <TooltipProvider>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-background">
        <svg
          ref={svgRef}
          role="application"
          aria-label="Canvas"
          aria-roledescription="whiteboard"
          className="absolute inset-0 size-full touch-none select-none"
          style={{
            cursor,
            backgroundImage: "radial-gradient(#d4d4d8 1px, transparent 1px)",
            backgroundSize: `${dotSize}px ${dotSize}px`,
            backgroundPosition: `${-cam.x * cam.zoom}px ${-cam.y * cam.zoom}px`,
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => provider.awareness?.setLocalStateField("pointer", null)}
          onDoubleClick={onDoubleClick}
        >
          <g transform={`scale(${cam.zoom}) translate(${-cam.x} ${-cam.y})`}>
            <CanvasShapes shapes={shapes} hideTextOf={editing} />
            {/* Other people's selections, in their colour. */}
            {peers.flatMap((peer) =>
              (peer.selection ?? []).map((id) => {
                const s = all.get(id);
                if (!s) return null;
                const b = boxOf(s, all);
                return (
                  <rect
                    key={`${peer.clientId}-${id}`}
                    x={b.x - 4}
                    y={b.y - 4}
                    width={b.w + 8}
                    height={b.h + 8}
                    fill="none"
                    stroke={peer.user.color}
                    strokeWidth={2 / cam.zoom}
                    rx={4}
                  />
                );
              }),
            )}
            {/* My selection. */}
            {selectedShapes.map((s) => {
              const b = boxOf(s, all);
              return (
                <rect
                  key={`sel-${s.id}`}
                  data-selected={s.id}
                  x={b.x - 4}
                  y={b.y - 4}
                  width={b.w + 8}
                  height={b.h + 8}
                  fill="none"
                  stroke="var(--brand)"
                  strokeDasharray={`${6 / cam.zoom} ${4 / cam.zoom}`}
                  strokeWidth={1.5 / cam.zoom}
                  rx={4}
                />
              );
            })}
            {marquee && (
              <rect
                x={marquee.x}
                y={marquee.y}
                width={marquee.w}
                height={marquee.h}
                fill="rgba(15,118,110,0.08)"
                stroke="var(--brand)"
                strokeWidth={1 / cam.zoom}
              />
            )}
            {resizable && single && (
              <rect
                aria-label="Resize"
                x={single.x + single.w - 6 / cam.zoom}
                y={single.y + single.h - 6 / cam.zoom}
                width={12 / cam.zoom}
                height={12 / cam.zoom}
                rx={2 / cam.zoom}
                fill="white"
                stroke="var(--brand)"
                strokeWidth={1.5 / cam.zoom}
                style={{ cursor: "nwse-resize" }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  svgRef.current?.setPointerCapture(e.pointerId);
                  gesture.current = {
                    kind: "resize",
                    id: single.id,
                    start: toCanvas(e.clientX, e.clientY),
                    box: { x: single.x, y: single.y, w: single.w, h: single.h },
                  };
                }}
              />
            )}
            {editingShape && (
              <foreignObject
                x={editingShape.x}
                y={editingShape.y}
                width={Math.max(editingShape.w, 40)}
                height={Math.max(editingShape.h, 32)}
              >
                <textarea
                  autoFocus
                  aria-label={`Text for ${editingShape.type === "sticky" ? "sticky note" : editingShape.type}`}
                  defaultValue={editingShape.text}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    updateShape(doc, editingShape.id, { text: e.target.value });
                    if (editingShape.type === "text") {
                      e.target.style.height = "0px";
                      updateShape(doc, editingShape.id, { h: Math.max(32, e.target.scrollHeight) });
                      e.target.style.height = "100%";
                    }
                  }}
                  onBlur={() => setEditing(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
                      e.preventDefault();
                      setEditing(null);
                    }
                  }}
                  className={cn(
                    "size-full resize-none bg-transparent outline-none",
                    editingShape.type === "text" ? "p-0.5 text-[20px]" : "p-3 text-[15px]",
                    (editingShape.type === "rect" || editingShape.type === "ellipse") && "text-center",
                  )}
                  style={{ lineHeight: 1.35, color: editingShape.type === "text" ? editingShape.color : "#18181b" }}
                />
              </foreignObject>
            )}
          </g>
        </svg>

        {/* Other people's cursors, kept the same size at any zoom. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          {peers
            .filter((p) => p.pointer)
            .map((p) => {
              const s = toScreen(p.pointer!);
              return (
                <div key={p.clientId} className="absolute" style={{ transform: `translate(${s.x}px, ${s.y}px)` }}>
                  <MousePointer2 className="size-4" style={{ color: p.user.color, fill: p.user.color }} />
                  <span
                    className="ml-3 rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-white"
                    style={{ background: p.user.color }}
                  >
                    {p.user.name}
                  </span>
                </div>
              );
            })}
        </div>

        {shapes.length === 0 && (
          <p className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-muted-foreground">
            {canEdit ? "Double-click anywhere for a sticky note, or pick a tool on the left." : "This canvas is empty."}
          </p>
        )}

        {/* Tools */}
        <div className="absolute top-3 left-3 flex flex-col gap-2">
          <ToggleGroup
            type="single"
            value={tool}
            onValueChange={(v) => v && setTool(v as Tool)}
            aria-label="Tools"
            className="flex-col rounded-xl border bg-card p-1 shadow-sm"
          >
            {TOOLS.filter((t) => canEdit || t.tool === "select" || t.tool === "hand").map((t) => (
              <Tooltip key={t.tool}>
                <TooltipTrigger asChild>
                  <ToggleGroupItem value={t.tool} aria-label={`${t.label} (${t.key.toUpperCase()})`} className="size-9">
                    <t.icon aria-hidden="true" />
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {t.label} <kbd className="ml-1 opacity-70">{t.key.toUpperCase()}</kbd>
                </TooltipContent>
              </Tooltip>
            ))}
          </ToggleGroup>
          {canEdit && (
            <div className="flex flex-col rounded-xl border bg-card p-1 shadow-sm">
              <IconButton label="Undo (Ctrl+Z)" onClick={() => undo.undo()}>
                <Undo2 aria-hidden="true" />
              </IconButton>
              <IconButton label="Redo (Ctrl+Shift+Z)" onClick={() => undo.redo()}>
                <Redo2 aria-hidden="true" />
              </IconButton>
            </div>
          )}
        </div>

        {/* Selection actions */}
        {canEdit && selectedShapes.length > 0 && !editing && (
          <div
            role="toolbar"
            aria-label="Selection"
            className="absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl border bg-card p-1 shadow-sm"
          >
            {palette.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Colour ${c}`}
                onClick={() => {
                  undo.stopCapturing();
                  selectedShapes.forEach((s) => updateShape(doc, s.id, { color: c }));
                }}
                className={cn(
                  "size-7 rounded-full border-2 border-white ring-1 ring-zinc-200",
                  selectedShapes.every((s) => s.color === c) && "ring-2 ring-brand",
                )}
                style={{ background: c }}
              />
            ))}
            <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
            <IconButton
              label="Duplicate (Ctrl+D)"
              onClick={() => {
                undo.stopCapturing();
                setSelected(new Set(duplicateShapes(doc, visibleSelection, me.id)));
              }}
            >
              <Copy aria-hidden="true" />
            </IconButton>
            <IconButton
              label="Bring to front"
              onClick={() => {
                undo.stopCapturing();
                bringToFront(doc, visibleSelection);
              }}
            >
              <BringToFront aria-hidden="true" />
            </IconButton>
            <IconButton
              label="Delete (Del)"
              onClick={() => {
                undo.stopCapturing();
                deleteShapes(doc, visibleSelection);
                setSelected(new Set());
              }}
            >
              <Trash2 aria-hidden="true" />
            </IconButton>
          </div>
        )}

        {/* Presence */}
        <div className="absolute top-3 right-3 flex items-center gap-3 rounded-xl border bg-card px-3 py-1.5 shadow-sm">
          <Presence
            peers={peers.map((p) => ({ clientId: p.clientId, name: p.user.name, color: p.user.color }))}
            following={leader?.clientId ?? null}
            onFollow={(p) => (p ? follow(p) : stop())}
          />
          <SyncBadge state={sync} pending={pending} />
        </div>

        {/* Zoom */}
        <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-xl border bg-card p-1 shadow-sm">
          <IconButton label="Zoom out" onClick={() => zoomAt(1 / 1.2)}>
            <Minus aria-hidden="true" />
          </IconButton>
          <Button
            variant="ghost"
            size="sm"
            className="w-14 tabular-nums"
            aria-label="Reset zoom to 100%"
            onClick={() => zoomAt(1 / cam.zoom)}
          >
            {Math.round(cam.zoom * 100)}%
          </Button>
          <IconButton label="Zoom in" onClick={() => zoomAt(1.2)}>
            <Plus aria-hidden="true" />
          </IconButton>
          <IconButton label="Zoom to fit" onClick={fit}>
            <Maximize aria-hidden="true" />
          </IconButton>
        </div>

        <FollowFrame leader={leader} onStop={stop} />
      </div>
    </TooltipProvider>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
