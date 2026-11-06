import { FileText, Shapes, SquareKanban } from "lucide-react";
import type { PageKind } from "@/db/schema";

export const KIND_LABEL: Record<PageKind, string> = {
  doc: "Doc",
  board: "Board",
  canvas: "Canvas",
};

export function PageIcon({ kind, className = "size-4" }: { kind: PageKind; className?: string }) {
  const Icon = kind === "board" ? SquareKanban : kind === "canvas" ? Shapes : FileText;
  return <Icon className={className} aria-hidden="true" />;
}
