"use client";

import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label as FieldLabel } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveAutomation } from "@/lib/automation-actions";
import {
  ACTION_TYPES,
  TRIGGER_TYPES,
  describeRule,
  parseRule,
  type Action,
  type Trigger,
} from "@/lib/automation-model";
import { LABELS, type Label } from "@/lib/board-model";

export type Column = { id: string; title: string };
export type Person = { id: string; name: string };
export type Draft = { id?: string; name: string; trigger: Trigger; actions: Action[] };

const LABEL_KEYS = Object.keys(LABELS) as Label[];
const ANY = "__any";

/** A fresh step of each kind, with sensible defaults. */
function blankAction(type: Action["type"], columns: Column[], people: Person[]): Action {
  switch (type) {
    case "move_to":
      return { type, columnId: columns.at(-1)?.id ?? "" };
    case "set_label":
      return { type, label: "blue" };
    case "assign":
      return { type, userId: people[0]?.id ?? "" };
    case "set_due":
      return { type, days: 3 };
    case "notify":
      return { type, to: "assignees" };
    default:
      return { type } as Action;
  }
}

function blankTrigger(type: Trigger["type"], columns: Column[]): Trigger {
  switch (type) {
    case "card_added":
      return { type, columnId: null };
    case "card_moved":
      return { type, columnId: columns.at(-1)?.id ?? "" };
    case "label_set":
      return { type, label: "red" };
    default:
      return { type };
  }
}

function ColumnSelect({
  value,
  onChange,
  columns,
  label,
  allowAny = false,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  columns: Column[];
  label: string;
  allowAny?: boolean;
}) {
  return (
    <Select value={value ?? ANY} onValueChange={(v) => onChange(v === ANY ? null : v)}>
      <SelectTrigger aria-label={label} className="w-full sm:w-48">
        <SelectValue placeholder="Pick a column" />
      </SelectTrigger>
      <SelectContent>
        {allowAny && <SelectItem value={ANY}>Any column</SelectItem>}
        {columns.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.title || "Untitled column"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function LabelSelect({
  value,
  onChange,
  label,
  allowNone = false,
}: {
  value: Label | null;
  onChange: (l: Label | null) => void;
  label: string;
  allowNone?: boolean;
}) {
  return (
    <Select value={value ?? ANY} onValueChange={(v) => onChange(v === ANY ? null : (v as Label))}>
      <SelectTrigger aria-label={label} className="w-full sm:w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value={ANY}>No label</SelectItem>}
        {LABEL_KEYS.map((k) => (
          <SelectItem key={k} value={k}>
            <span className="size-2.5 rounded-full" style={{ background: LABELS[k].text }} aria-hidden="true" />
            {LABELS[k].name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ActionParams({
  action,
  onChange,
  columns,
  people,
  n,
}: {
  action: Action;
  onChange: (a: Action) => void;
  columns: Column[];
  people: Person[];
  n: number;
}) {
  switch (action.type) {
    case "move_to":
      return (
        <ColumnSelect
          label={`Step ${n} column`}
          value={action.columnId}
          onChange={(id) => onChange({ ...action, columnId: id ?? "" })}
          columns={columns}
        />
      );
    case "set_label":
      return (
        <LabelSelect
          label={`Step ${n} label`}
          value={action.label}
          onChange={(label) => onChange({ ...action, label })}
          allowNone
        />
      );
    case "assign":
      return (
        <Select value={action.userId} onValueChange={(userId) => onChange({ ...action, userId })}>
          <SelectTrigger aria-label={`Step ${n} person`} className="w-full sm:w-48">
            <SelectValue placeholder="Pick someone" />
          </SelectTrigger>
          <SelectContent>
            {people.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "set_due":
      return (
        <span className="flex items-center gap-2 text-sm">
          in
          <Input
            type="number"
            min={0}
            max={365}
            value={action.days}
            onChange={(e) => onChange({ ...action, days: Math.max(0, Math.min(365, Number(e.target.value) || 0)) })}
            aria-label={`Step ${n} days`}
            className="w-20"
          />
          days
        </span>
      );
    case "notify":
      return (
        <Select value={action.to} onValueChange={(to) => onChange({ ...action, to })}>
          <SelectTrigger aria-label={`Step ${n} who`} className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="assignees">Its assignees</SelectItem>
            <SelectItem value="creator">Whoever made the card</SelectItem>
            {people.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    default:
      return null;
  }
}

/** The "New rule" / "Edit rule" dialog. */
export function RuleBuilder({
  open,
  onOpenChange,
  pageId,
  initial,
  columns,
  people,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageId: string;
  initial: Draft;
  columns: Column[];
  people: Person[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(initial);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const names = useMemo(
    () => ({
      columns: new Map(columns.map((c) => [c.id, c.title])),
      people: new Map(people.map((p) => [p.id, p.name])),
    }),
    [columns, people],
  );
  const problem = parseRule(draft);
  const preview = typeof problem === "string" ? null : describeRule(problem, names);

  const setAction = (i: number, a: Action) =>
    setDraft((d) => ({ ...d, actions: d.actions.map((x, j) => (j === i ? a : x)) }));

  function save(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveAutomation(pageId, draft);
      if (!result.ok) return setError(result.error);
      onOpenChange(false);
      toast.success(draft.id ? "Rule saved" : `Rule “${draft.name.trim()}” is on`, {
        description: draft.id ? undefined : "It runs for everyone's changes from now on.",
      });
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={save} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit rule" : "New rule"}</DialogTitle>
            <DialogDescription>Rules run automatically when anyone changes this board.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor="rule-name">Name</FieldLabel>
            <Input
              id="rule-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="e.g. Tidy up finished cards"
              maxLength={80}
            />
          </div>

          <fieldset className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3">
            <legend className="px-1 text-sm font-semibold">When…</legend>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select
                value={draft.trigger.type}
                onValueChange={(t) => setDraft({ ...draft, trigger: blankTrigger(t as Trigger["type"], columns) })}
              >
                <SelectTrigger aria-label="When" className="w-full sm:flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_TYPES.map((t) => (
                    <SelectItem key={t.type} value={t.type}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {draft.trigger.type === "card_added" && (
                <ColumnSelect
                  label="Added to"
                  value={draft.trigger.columnId}
                  onChange={(columnId) => setDraft({ ...draft, trigger: { type: "card_added", columnId } })}
                  columns={columns}
                  allowAny
                />
              )}
              {draft.trigger.type === "card_moved" && (
                <ColumnSelect
                  label="Moves to"
                  value={draft.trigger.columnId}
                  onChange={(columnId) =>
                    setDraft({ ...draft, trigger: { type: "card_moved", columnId: columnId ?? "" } })
                  }
                  columns={columns}
                />
              )}
              {draft.trigger.type === "label_set" && (
                <LabelSelect
                  label="Label"
                  value={draft.trigger.label}
                  onChange={(label) => setDraft({ ...draft, trigger: { type: "label_set", label: label ?? "red" } })}
                />
              )}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3">
            <legend className="px-1 text-sm font-semibold">Then…</legend>
            <ol className="flex flex-col gap-2">
              {draft.actions.map((action, i) => (
                <li key={i} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Select
                    value={action.type}
                    onValueChange={(t) => setAction(i, blankAction(t as Action["type"], columns, people))}
                  >
                    <SelectTrigger aria-label={`Step ${i + 1}`} className="w-full sm:flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTION_TYPES.map((a) => (
                        <SelectItem key={a.type} value={a.type}>
                          {a.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <ActionParams
                    action={action}
                    onChange={(a) => setAction(i, a)}
                    columns={columns}
                    people={people}
                    n={i + 1}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove step ${i + 1}`}
                    disabled={draft.actions.length === 1}
                    onClick={() => setDraft({ ...draft, actions: draft.actions.filter((_, j) => j !== i) })}
                  >
                    <X aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ol>
            {draft.actions.length < 6 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() =>
                  setDraft({ ...draft, actions: [...draft.actions, blankAction("notify", columns, people)] })
                }
              >
                <Plus aria-hidden="true" /> Add a step
              </Button>
            )}
          </fieldset>

          <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand-strong" aria-live="polite">
            {preview ?? (typeof problem === "string" ? problem : "")}
          </p>
          <FormError message={error} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="brand" disabled={pending || !preview || !draft.name.trim()}>
              {pending ? "Saving…" : draft.id ? "Save rule" : "Turn on rule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
