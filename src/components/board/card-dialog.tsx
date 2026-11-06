"use client";

import { Trash2, X } from "lucide-react";
import { useState } from "react";
import type * as Y from "yjs";
import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  checklistItem,
  deleteCard,
  LABELS,
  REACTIONS,
  toggleReaction,
  updateCard,
  type Card,
  type Label as LabelKey,
} from "@/lib/board-model";
import { cn, timeAgo } from "@/lib/utils";
import type { Member } from "./card-tile";

type Props = {
  doc: Y.Doc;
  card: Card | null;
  columnTitle: string;
  members: Member[];
  me: Member;
  canEdit: boolean;
  onClose: () => void;
  onDeleted: (card: Card) => void;
};

export function CardDialog({ card, ...rest }: Props) {
  return (
    <Dialog open={card !== null} onOpenChange={(open) => !open && rest.onClose()}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        {/* Keyed so the form resets when a different card opens. */}
        {card && <CardDetail key={card.id} card={card} {...rest} />}
      </DialogContent>
    </Dialog>
  );
}

function CardDetail({ doc, card, columnTitle, members, me, canEdit, onClose, onDeleted }: Props & { card: Card }) {
  const [newItem, setNewItem] = useState("");
  const set = (fields: Parameters<typeof updateCard>[2]) => updateCard(doc, card.id, fields);
  const creator = members.find((m) => m.id === card.createdBy);
  const done = card.checklist.filter((i) => i.done).length;

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-1 border-b px-6 pt-6 pb-4">
        <DialogDescription>In {columnTitle}</DialogDescription>
        <DialogTitle className="sr-only">{card.title || "Untitled card"}</DialogTitle>
        <label htmlFor="card-title" className="sr-only">
          Card title
        </label>
        <input
          id="card-title"
          defaultValue={card.title}
          readOnly={!canEdit}
          maxLength={200}
          onBlur={(e) => {
            const title = e.currentTarget.value.trim();
            if (title && title !== card.title) set({ title });
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className="mr-8 rounded-md bg-transparent text-2xl font-bold tracking-tight outline-none focus-visible:bg-zinc-50"
        />
      </div>

      <div className="flex flex-wrap">
        <div className="flex min-w-0 flex-[999_1_340px] flex-col gap-6 p-6">
          <div className="flex flex-col gap-2">
            <Label htmlFor="card-desc">Description</Label>
            <Textarea
              id="card-desc"
              defaultValue={card.description}
              readOnly={!canEdit}
              placeholder={canEdit ? "Add more detail…" : "No description"}
              rows={4}
              onBlur={(e) => e.currentTarget.value !== card.description && set({ description: e.currentTarget.value })}
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Checklist</span>
              {card.checklist.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {done} of {card.checklist.length}
                </span>
              )}
            </div>
            {card.checklist.length > 0 && (
              <div className="h-1.5 rounded-full bg-zinc-100" aria-hidden="true">
                <div
                  className="h-1.5 rounded-full bg-brand transition-all"
                  style={{ width: `${(done / card.checklist.length) * 100}%` }}
                />
              </div>
            )}
            <ul className="flex flex-col gap-1">
              {card.checklist.map((item) => (
                <li key={item.id} className="group flex items-center gap-2.5 rounded-md px-1 hover:bg-zinc-50">
                  <input
                    type="checkbox"
                    id={`chk-${item.id}`}
                    checked={item.done}
                    disabled={!canEdit}
                    onChange={(e) =>
                      set({
                        checklist: card.checklist.map((i) =>
                          i.id === item.id ? { ...i, done: e.currentTarget.checked } : i,
                        ),
                      })
                    }
                    className="size-4 accent-[var(--brand)]"
                  />
                  <label
                    htmlFor={`chk-${item.id}`}
                    className={cn("flex-1 py-1.5 text-sm", item.done && "text-muted-foreground line-through")}
                  >
                    {item.text}
                  </label>
                  {canEdit && (
                    <button
                      type="button"
                      aria-label={`Remove “${item.text}”`}
                      onClick={() => set({ checklist: card.checklist.filter((i) => i.id !== item.id) })}
                      className="grid size-7 place-items-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-zinc-200 focus-visible:opacity-100"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {canEdit && (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newItem.trim()) return;
                  set({ checklist: [...card.checklist, checklistItem(newItem.trim())] });
                  setNewItem("");
                }}
              >
                <label htmlFor="new-item" className="sr-only">
                  New checklist item
                </label>
                <Input
                  id="new-item"
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  placeholder="Add an item"
                  className="h-9 text-sm"
                />
                <Button type="submit" variant="outline" size="sm" className="h-9">
                  Add
                </Button>
              </form>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Reactions</span>
            <div className="flex flex-wrap gap-1.5">
              {REACTIONS.map((emoji) => {
                const users = card.reactions[emoji] ?? [];
                const mine = users.includes(me.id);
                return (
                  <button
                    key={emoji}
                    type="button"
                    aria-pressed={mine}
                    aria-label={`React ${emoji}`}
                    onClick={() => toggleReaction(doc, card.id, emoji, me.id)}
                    className={cn(
                      "flex h-9 items-center gap-1 rounded-full border px-3 text-sm hover:bg-zinc-50",
                      mine && "border-brand bg-brand-soft",
                    )}
                  >
                    {emoji}
                    {users.length > 0 && <span className="text-xs">{users.length}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <aside className="flex flex-[1_1_220px] flex-col gap-5 border-l bg-zinc-50/60 p-6 text-sm">
          <div className="flex flex-col gap-2">
            <span className="font-medium">Assignees</span>
            <div className="flex flex-col gap-1">
              {members.map((m) => {
                const on = card.assignees.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={!canEdit}
                    aria-pressed={on}
                    onClick={() =>
                      set({ assignees: on ? card.assignees.filter((id) => id !== m.id) : [...card.assignees, m.id] })
                    }
                    className={cn(
                      "flex min-h-9 items-center gap-2 rounded-md px-2 text-left hover:bg-zinc-100 disabled:hover:bg-transparent",
                      on && "bg-brand-soft hover:bg-brand-soft",
                    )}
                  >
                    <MemberAvatar name={m.name} color={m.color} className="size-6" />
                    <span className="flex-1 truncate">{m.id === me.id ? `${m.name} (you)` : m.name}</span>
                    {on && <span className="text-xs text-brand-strong">Assigned</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="font-medium">Label</span>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(LABELS) as LabelKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  disabled={!canEdit}
                  aria-pressed={card.label === key}
                  onClick={() => set({ label: card.label === key ? null : key })}
                  className={cn(
                    "rounded-md px-2 py-1 text-xs font-medium ring-offset-1",
                    card.label === key && "ring-2 ring-foreground",
                  )}
                  style={{ background: LABELS[key].bg, color: LABELS[key].text }}
                >
                  {LABELS[key].name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="card-due">Due date</Label>
            <div className="flex gap-2">
              <Input
                id="card-due"
                type="date"
                value={card.due ?? ""}
                disabled={!canEdit}
                onChange={(e) => set({ due: e.target.value || null })}
                className="h-9 text-sm"
              />
              {card.due && canEdit && (
                <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => set({ due: null })}>
                  Clear
                </Button>
              )}
            </div>
          </div>

          <p className="mt-auto text-xs leading-relaxed text-muted-foreground">
            Created by {creator?.name ?? "someone"} · {card.createdAt ? timeAgo(new Date(card.createdAt)) : ""}
          </p>
          {canEdit && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                deleteCard(doc, card.id);
                onClose();
                onDeleted(card);
              }}
            >
              <Trash2 /> Delete card
            </Button>
          )}
        </aside>
      </div>
    </div>
  );
}
