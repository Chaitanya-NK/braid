import { Badge } from "@/components/ui/badge";
import type { BranchStatus } from "@/db/schema";
import { cn } from "@/lib/utils";

const STATUS = {
  open: { label: "Open", className: "bg-emerald-100 text-emerald-900" },
  merged: { label: "Merged", className: "bg-violet-100 text-violet-900" },
  closed: { label: "Closed", className: "bg-zinc-200 text-zinc-800" },
} as const;

export function BranchStatusBadge({ status, className }: { status: BranchStatus; className?: string }) {
  return <Badge className={cn(STATUS[status].className, className)}>{STATUS[status].label}</Badge>;
}
