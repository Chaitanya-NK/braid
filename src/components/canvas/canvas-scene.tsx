import { useMemo } from "react";
import { arrowEnds, boundsOf, SHAPE_NAMES, type Shape } from "@/lib/canvas-model";

/**
 * Draws canvas shapes as SVG. Used by the live canvas (inside its camera
 * transform) and, read-only, by Rewind, branch review and recaps.
 */

const FONT = "var(--font-sans, ui-sans-serif, system-ui)";

function ShapeText({ shape, align = "start", size = 15 }: { shape: Shape; align?: "start" | "center"; size?: number }) {
  if (!shape.text) return null;
  return (
    <foreignObject x={shape.x} y={shape.y} width={Math.max(1, shape.w)} height={Math.max(1, shape.h)}>
      <div
        style={{
          width: "100%",
          height: "100%",
          padding: shape.type === "text" ? 2 : 12,
          display: "flex",
          alignItems: align === "center" ? "center" : "flex-start",
          justifyContent: align === "center" ? "center" : "flex-start",
          textAlign: align === "center" ? "center" : "left",
          fontFamily: FONT,
          fontSize: size,
          lineHeight: 1.35,
          color: shape.type === "text" ? shape.color : "#18181b",
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          overflow: "hidden",
          userSelect: "none",
        }}
      >
        {shape.text}
      </div>
    </foreignObject>
  );
}

function label(shape: Shape) {
  const text = shape.text.trim();
  return text ? `${SHAPE_NAMES[shape.type]}: ${text}` : SHAPE_NAMES[shape.type];
}

export function ShapeView({ shape, all, hideText }: { shape: Shape; all: Map<string, Shape>; hideText?: boolean }) {
  const common = { role: "img", "aria-label": label(shape), "data-shape-id": shape.id };
  switch (shape.type) {
    case "sticky":
      return (
        <g {...common}>
          <rect x={shape.x} y={shape.y + 3} width={shape.w} height={shape.h} rx={6} fill="rgba(0,0,0,0.08)" />
          <rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={6} fill={shape.color} />
          {!hideText && <ShapeText shape={shape} />}
        </g>
      );
    case "rect":
      return (
        <g {...common}>
          <rect
            x={shape.x}
            y={shape.y}
            width={shape.w}
            height={shape.h}
            rx={8}
            fill={`${shape.color}14`}
            stroke={shape.color}
            strokeWidth={2}
          />
          {!hideText && <ShapeText shape={shape} align="center" />}
        </g>
      );
    case "ellipse":
      return (
        <g {...common}>
          <ellipse
            cx={shape.x + shape.w / 2}
            cy={shape.y + shape.h / 2}
            rx={Math.max(1, shape.w / 2)}
            ry={Math.max(1, shape.h / 2)}
            fill={`${shape.color}14`}
            stroke={shape.color}
            strokeWidth={2}
          />
          {!hideText && <ShapeText shape={shape} align="center" />}
        </g>
      );
    case "text":
      return <g {...common}>{!hideText && <ShapeText shape={shape} size={20} />}</g>;
    case "arrow": {
      const [a, b] = arrowEnds(shape, all);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const head = 12;
      const p1 = { x: b.x - head * Math.cos(angle - 0.45), y: b.y - head * Math.sin(angle - 0.45) };
      const p2 = { x: b.x - head * Math.cos(angle + 0.45), y: b.y - head * Math.sin(angle + 0.45) };
      return (
        <g {...common} data-from={shape.from ?? undefined} data-to={shape.to ?? undefined}>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={shape.color} strokeWidth={2.5} strokeLinecap="round" />
          <polygon points={`${b.x},${b.y} ${p1.x},${p1.y} ${p2.x},${p2.y}`} fill={shape.color} />
        </g>
      );
    }
    case "pen": {
      const pts: string[] = [];
      for (let i = 0; i + 1 < shape.points.length; i += 2) {
        pts.push(`${shape.x + shape.points[i]},${shape.y + shape.points[i + 1]}`);
      }
      return (
        <g {...common}>
          <polyline
            points={pts.join(" ")}
            fill="none"
            stroke={shape.color}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      );
    }
  }
}

/** All shapes, back to front. */
export function CanvasShapes({ shapes, hideTextOf }: { shapes: Shape[]; hideTextOf?: string | null }) {
  const all = useMemo(() => new Map(shapes.map((s) => [s.id, s])), [shapes]);
  return (
    <>
      {shapes.map((s) => (
        <ShapeView key={s.id} shape={s} all={all} hideText={s.id === hideTextOf} />
      ))}
    </>
  );
}

/** A read-only canvas, zoomed to fit its shapes. */
export function StaticCanvas({ shapes, label = "Canvas at this moment" }: { shapes: Shape[]; label?: string }) {
  const box = boundsOf(shapes);
  if (!box) return <p className="text-muted-foreground">The canvas was empty at this point.</p>;
  const pad = 40;
  return (
    <svg
      role="group"
      aria-label={label}
      viewBox={`${box.x - pad} ${box.y - pad} ${box.w + pad * 2} ${box.h + pad * 2}`}
      className="h-[60vh] w-full rounded-xl bg-[radial-gradient(#e4e4e7_1px,transparent_1px)] [background-size:20px_20px]"
    >
      <CanvasShapes shapes={shapes} />
    </svg>
  );
}
