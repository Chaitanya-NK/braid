"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Eye, MessageSquare, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Presence, SyncBadge, useConnectionToasts } from "@/components/collab/status";
import { useCollab, useSyncState, type Collab } from "@/components/collab/use-collab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  addCard,
  addColumn,
  deleteColumn,
  LABELS,
  moveCard,
  moveColumn,
  readBoard,
  renameColumn,
  restoreCard,
  type Card,
  type Label,
} from "@/lib/board-model";
import { cn } from "@/lib/utils";
import { BoardColumn } from "./board-column";
import { CardDialog } from "./card-dialog";
import { CardFace, type Member } from "./card-tile";
import { LivePointers } from "./live-pointers";
import { setPresence, useBoardPeers, useBoardSnapshot, useCardActivity } from "./use-board";

type Props = { pageId: string; me: Member; members: Member[]; readOnly: boolean };

/** A live, multiplayer kanban board backed by a Yjs document. */
export function BoardView({ pageId, ...rest }: Props) {
  const collab = useCollab(pageId, () =>
    toast.error("Couldn't open this board", {
      description: "You may no longer have access, or your session expired. Try reloading.",
      id: "board-access",
    }),
  );
  if (!collab) return <BoardSkeleton />;
  return <LiveBoard collab={collab} {...rest} />;
}

function LiveBoard({ collab, me, members, readOnly }: Omit<Props, "pageId"> & { collab: Collab }) {
  const { doc, provider } = collab;
  const board = useBoardSnapshot(doc);
  const sync = useSyncState(provider);
  const peers = useBoardPeers(provider);
  const activity = useCardActivity(provider);
  useConnectionToasts(sync);

  const surfaceRef = useRef<HTMLDivElement>(null);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);
  const [labelFilter, setLabelFilter] = useState<Label | "all">("all");
  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  // Tell everyone who I am on this board.
  useEffect(() => {
    setPresence(provider, { user: me, pointer: null, chat: null, dragging: null, editing: null });
  }, [provider, me]);

  // Tell everyone which card I have open.
  useEffect(() => {
    setPresence(provider, { editing: openCardId });
  }, [provider, openCardId]);

  const filtering = onlyMine || labelFilter !== "all";
  const canEdit = !readOnly;
  const canDrag = canEdit && !filtering;
  const matches = (c: Card) =>
    (!onlyMine || c.assignees.includes(me.id)) && (labelFilter === "all" || c.label === labelFilter);

  const allCards = useMemo(() => board.columns.flatMap((c) => c.cards), [board]);
  const openCard = allCards.find((c) => c.id === openCardId) ?? null;
  const activeCard = allCards.find((c) => c.id === activeId) ?? null;

  const sensors = useSensors(
    // A small movement threshold so a click still opens the card.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /** Column a card or drop target belongs to, from the latest doc state. */
  function columnOf(id: string) {
    if (id.startsWith("col:")) return id.slice(4);
    return readBoard(doc).columns.find((c) => c.cards.some((card) => card.id === id))?.id;
  }

  function onDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id));
    setPresence(provider, { dragging: String(active.id) });
  }

  // Crossing into another column moves the card right away, so everyone sees it travel.
  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const cardId = String(active.id);
    const overId = String(over.id);
    const from = columnOf(cardId);
    const to = columnOf(overId);
    if (!from || !to || from === to) return;
    const target = readBoard(doc).columns.find((c) => c.id === to);
    if (!target) return;
    const overIndex = overId.startsWith("col:") ? -1 : target.cards.findIndex((c) => c.id === overId);
    moveCard(doc, cardId, to, overIndex < 0 ? target.cards.length : overIndex);
  }

  // Within a column, settle the final position on drop.
  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    setPresence(provider, { dragging: null });
    if (!over) return;
    const cardId = String(active.id);
    const overId = String(over.id);
    const colId = columnOf(cardId);
    const col = readBoard(doc).columns.find((c) => c.id === colId);
    if (!col || overId.startsWith("col:") || columnOf(overId) !== colId) return;
    const ids = col.cards.map((c) => c.id);
    const oldIndex = ids.indexOf(cardId);
    const newIndex = ids.indexOf(overId);
    if (oldIndex === newIndex || newIndex < 0) return;
    const moved = arrayMove(ids, oldIndex, newIndex);
    moveCard(doc, cardId, col.id, moved.indexOf(cardId));
  }

  function onDragCancel() {
    setActiveId(null);
    setPresence(provider, { dragging: null });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-6 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={onlyMine}
            onClick={() => setOnlyMine((v) => !v)}
            className={cn(
              "h-8 rounded-full border px-3 text-sm hover:bg-accent",
              onlyMine && "border-brand bg-brand-soft text-brand-strong hover:bg-brand-soft",
            )}
          >
            Assigned to me
          </button>
          <label htmlFor="label-filter" className="sr-only">
            Filter by label
          </label>
          <select
            id="label-filter"
            value={labelFilter}
            onChange={(e) => setLabelFilter(e.target.value as Label | "all")}
            className="h-8 rounded-full border bg-card px-3 text-sm"
          >
            <option value="all">All labels</option>
            {(Object.keys(LABELS) as Label[]).map((key) => (
              <option key={key} value={key}>
                {LABELS[key].name}
              </option>
            ))}
          </select>
          {filtering && <span className="text-xs text-muted-foreground">Dragging is paused while filtering</span>}
          {readOnly && (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Eye className="size-4" aria-hidden="true" /> View only
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-1 text-xs text-muted-foreground lg:flex">
            <MessageSquare className="size-3.5" aria-hidden="true" /> Press{" "}
            <kbd className="rounded border bg-zinc-50 px-1 font-mono">/</kbd> to chat
          </span>
          <Presence peers={peers} />
          <SyncBadge state={sync} />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div ref={surfaceRef} className="relative min-h-full w-max min-w-full p-6">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
            onDragCancel={onDragCancel}
          >
            <div className="flex items-start gap-4">
              {board.columns.map((column, i) => (
                <BoardColumn
                  key={column.id}
                  column={column}
                  visibleCards={column.cards.filter(matches)}
                  members={memberMap}
                  activity={activity}
                  canEdit={canEdit}
                  canDrag={canDrag}
                  isFirst={i === 0}
                  isLast={i === board.columns.length - 1}
                  onOpenCard={setOpenCardId}
                  onAddCard={(title) => addCard(doc, column.id, title, me.id)}
                  onRename={(title) => renameColumn(doc, column.id, title)}
                  onMove={(dir) => moveColumn(doc, column.id, i + dir)}
                  onDelete={() => deleteColumn(doc, column.id)}
                />
              ))}
              {canEdit && <AddColumn onAdd={(title) => addColumn(doc, title)} />}
              {board.columns.length === 0 && !canEdit && (
                <p className="text-muted-foreground">This board is empty.</p>
              )}
            </div>
            <DragOverlay>
              {activeCard ? (
                <CardFace card={activeCard} members={memberMap} className="w-[256px] rotate-2 shadow-xl" />
              ) : null}
            </DragOverlay>
          </DndContext>
          <LivePointers provider={provider} surfaceRef={surfaceRef} me={me} />
        </div>
      </div>

      <CardDialog
        doc={doc}
        card={openCard}
        columnTitle={board.columns.find((c) => c.id === openCard?.columnId)?.title ?? ""}
        members={members}
        me={me}
        canEdit={canEdit}
        onClose={() => setOpenCardId(null)}
        onDeleted={(card) =>
          toast(`“${card.title}” deleted`, {
            action: { label: "Undo", onClick: () => restoreCard(doc, card) },
          })
        }
      />
    </div>
  );
}

function AddColumn({ onAdd }: { onAdd: (title: string) => void }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button variant="ghost" className="h-11 w-[280px] shrink-0 justify-start bg-black/[0.03]" onClick={() => setOpen(true)}>
        <Plus /> Add column
      </Button>
    );
  }
  return (
    <form
      className="flex w-[280px] shrink-0 flex-col gap-2 rounded-xl bg-sunken p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        const title = String(new FormData(e.currentTarget).get("title") ?? "").trim();
        if (title) onAdd(title);
        setOpen(false);
      }}
    >
      <label htmlFor="new-column" className="sr-only">
        Column name
      </label>
      <Input
        id="new-column"
        name="title"
        autoFocus
        maxLength={60}
        placeholder="Column name"
        className="h-9 text-sm"
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          Add column
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function BoardSkeleton() {
  return (
    <div aria-busy="true" className="flex gap-4 p-6">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-64 w-[280px] rounded-xl" />
      ))}
    </div>
  );
}
