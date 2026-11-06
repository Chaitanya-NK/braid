"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ArrowLeft, ArrowRight, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Card, Column } from "@/lib/board-model";
import { cn } from "@/lib/utils";
import { CardTile, type Member } from "./card-tile";
import type { CardActivity } from "./use-board";

type Props = {
  column: Column & { cards: Card[] };
  visibleCards: Card[];
  members: Map<string, Member>;
  activity: CardActivity;
  canEdit: boolean;
  canDrag: boolean;
  isFirst: boolean;
  isLast: boolean;
  onOpenCard: (id: string) => void;
  onAddCard: (title: string) => void;
  onRename: (title: string) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
};

export function BoardColumn(props: Props) {
  const { column, visibleCards, members, activity, canEdit, canDrag } = props;
  const { setNodeRef, isOver } = useDroppable({ id: `col:${column.id}`, data: { type: "column" } });
  const [renaming, setRenaming] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <section
      aria-label={column.title}
      className={cn(
        "flex w-[280px] shrink-0 flex-col gap-2 rounded-xl bg-sunken p-2.5 transition-colors",
        isOver && "bg-brand-soft",
      )}
    >
      <header className="flex min-h-9 items-center gap-2 px-1">
        {renaming ? (
          <form
            className="flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              const title = String(new FormData(e.currentTarget).get("title") ?? "").trim();
              if (title) props.onRename(title);
              setRenaming(false);
            }}
          >
            <label htmlFor={`rename-${column.id}`} className="sr-only">
              Column name
            </label>
            <Input
              id={`rename-${column.id}`}
              name="title"
              defaultValue={column.title}
              autoFocus
              maxLength={60}
              onBlur={(e) => e.currentTarget.form?.requestSubmit()}
              onKeyDown={(e) => e.key === "Escape" && setRenaming(false)}
              className="h-8 px-2 text-sm font-semibold"
            />
          </form>
        ) : (
          <h2 className="flex-1 truncate text-sm font-semibold">{column.title}</h2>
        )}
        <span className="text-xs text-muted-foreground">{column.cards.length}</span>
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`${column.title} column options`}
                className="size-8 text-muted-foreground hover:bg-black/5"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setRenaming(true)}>
                <Pencil /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem disabled={props.isFirst} onSelect={() => props.onMove(-1)}>
                <ArrowLeft /> Move left
              </DropdownMenuItem>
              <DropdownMenuItem disabled={props.isLast} onSelect={() => props.onMove(1)}>
                <ArrowRight /> Move right
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => (column.cards.length ? setConfirmDelete(true) : props.onDelete())}
              >
                <Trash2 /> Delete column
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      <SortableContext id={column.id} items={visibleCards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className="flex min-h-12 flex-col gap-2" aria-label={`Cards in ${column.title}`}>
          {visibleCards.map((card) => (
            <CardTile
              key={card.id}
              card={card}
              members={members}
              activity={activity[card.id]}
              draggable={canDrag}
              onOpen={() => props.onOpenCard(card.id)}
            />
          ))}
          {visibleCards.length === 0 && (
            <li className="list-none rounded-lg border border-dashed border-zinc-300 px-3 py-4 text-center text-xs text-muted-foreground">
              {column.cards.length ? "No cards match the filter" : "Drop cards here"}
            </li>
          )}
        </ul>
      </SortableContext>

      {canEdit &&
        (adding ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const field = e.currentTarget.elements.namedItem("title") as HTMLTextAreaElement;
              const title = field.value.trim();
              if (title) props.onAddCard(title);
              field.value = "";
              field.focus();
            }}
          >
            <label htmlFor={`new-card-${column.id}`} className="sr-only">
              Card title
            </label>
            <Textarea
              id={`new-card-${column.id}`}
              name="title"
              autoFocus
              rows={2}
              maxLength={200}
              placeholder="What needs doing?"
              className="min-h-14 resize-none text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
                if (e.key === "Escape") setAdding(false);
              }}
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm">
                Add card
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAdding(true)}
            className="h-9 justify-start text-muted-foreground hover:bg-black/5"
          >
            <Plus aria-hidden="true" /> Add card
          </Button>
        ))}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{column.title}” and its {column.cards.length} cards?</AlertDialogTitle>
            <AlertDialogDescription>This removes them for everyone on the board.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={props.onDelete} className={buttonVariants({ variant: "destructive" })}>
              Delete column
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
