"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays, CheckSquare, AlignLeft } from "lucide-react";
import { MemberAvatar } from "@/components/member-avatar";
import { LABELS, type Card } from "@/lib/board-model";
import { cn } from "@/lib/utils";
import type { CardActivity } from "./use-board";

export type Member = { id: string; name: string; color: string };

function dueText(due: string) {
  const d = new Date(`${due}T00:00:00`);
  return d.toLocaleDateString("en", { month: "short", day: "numeric" });
}

function isOverdue(due: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${due}T00:00:00`) < today;
}

/** What a card looks like. Used in the column and as the drag preview. */
export function CardFace({
  card,
  members,
  activity,
  className,
}: {
  card: Card;
  members: Map<string, Member>;
  activity?: CardActivity[string];
  className?: string;
}) {
  const done = card.checklist.filter((i) => i.done).length;
  const assignees = card.assignees.map((id) => members.get(id)).filter(Boolean) as Member[];
  const reactions = Object.entries(card.reactions).filter(([, users]) => users.length > 0);

  return (
    <div
      className={cn(
        "relative flex flex-col gap-2.5 rounded-lg border bg-card p-3 text-left shadow-xs",
        activity && "border-2",
        className,
      )}
      style={activity ? { borderColor: activity.color } : undefined}
    >
      {activity && (
        <span
          className="absolute -top-2.5 right-2 rounded px-1.5 py-0.5 text-[11px] font-medium text-white"
          style={{ background: activity.color }}
        >
          {activity.name.split(" ")[0]} is {activity.kind}
        </span>
      )}
      {card.label && (
        <span
          className="w-fit rounded-md px-2 py-0.5 text-xs font-medium"
          style={{ background: LABELS[card.label].bg, color: LABELS[card.label].text }}
        >
          {LABELS[card.label].name}
        </span>
      )}
      <span className="text-[15px] leading-snug font-medium break-words">{card.title || "Untitled card"}</span>

      {(card.due || card.checklist.length > 0 || card.description || assignees.length > 0) && (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          {card.due && (
            <span className={cn("flex items-center gap-1", isOverdue(card.due) && "font-medium text-destructive")}>
              <CalendarDays className="size-3.5" aria-hidden="true" />
              {dueText(card.due)}
            </span>
          )}
          {card.checklist.length > 0 && (
            <span className={cn("flex items-center gap-1", done === card.checklist.length && "text-green-700")}>
              <CheckSquare className="size-3.5" aria-hidden="true" />
              {done}/{card.checklist.length}
            </span>
          )}
          {card.description && <AlignLeft className="size-3.5" aria-label="Has a description" />}
          {assignees.length > 0 && (
            <span className="ml-auto flex -space-x-1.5">
              {assignees.slice(0, 3).map((m) => (
                <MemberAvatar key={m.id} name={m.name} color={m.color} className="size-6 ring-2 ring-card" />
              ))}
            </span>
          )}
        </span>
      )}

      {reactions.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {reactions.map(([emoji, users]) => (
            <span key={emoji} className="rounded-full border bg-background px-1.5 py-0.5 text-xs">
              {emoji} {users.length}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

/** A card in a column: draggable, and opens the detail dialog on click or Enter. */
export function CardTile({
  card,
  members,
  activity,
  draggable,
  onOpen,
}: {
  card: Card;
  members: Map<string, Member>;
  activity?: CardActivity[string];
  draggable: boolean;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: "card", columnId: card.columnId },
    disabled: !draggable,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("list-none", isDragging && "opacity-40")}
    >
      <div
        {...attributes}
        {...listeners}
        role="button"
        tabIndex={0}
        aria-label={`Open card: ${card.title || "Untitled card"}`}
        aria-roledescription={draggable ? "draggable card" : "card"}
        onClick={onOpen}
        onKeyDown={(e) => {
          // Space starts a keyboard drag (dnd-kit); Enter opens the card.
          if (e.key === "Enter") {
            e.preventDefault();
            onOpen();
            return;
          }
          listeners?.onKeyDown?.(e);
        }}
        className="cursor-pointer rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 hover:[&>div]:border-zinc-300"
      >
        <CardFace card={card} members={members} activity={activity} />
      </div>
    </li>
  );
}
