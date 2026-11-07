"use client";

import { MoreHorizontal, Pencil, Plus, Trash2, Workflow } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { deleteAutomation, setAutomationEnabled } from "@/lib/automation-actions";
import { describeRule, type Action, type Trigger } from "@/lib/automation-model";
import { timeAgo } from "@/lib/utils";
import { RuleBuilder, type Column, type Draft, type Person } from "./rule-builder";

export type SavedRule = {
  id: string;
  name: string;
  enabled: boolean;
  trigger: Trigger;
  actions: Action[];
  runCount: number;
  lastRunAt: number | null;
};

/** Ready-made rules for this board's own columns. */
function templates(columns: Column[]): Draft[] {
  const first = columns[0];
  const second = columns[1];
  const last = columns.at(-1);
  const out: Draft[] = [];
  if (last && columns.length > 1) {
    out.push({
      name: "Tidy up finished cards",
      trigger: { type: "card_moved", columnId: last.id },
      actions: [{ type: "complete_checklist" }, { type: "notify", to: "creator" }],
    });
  }
  if (second && columns.length > 2) {
    out.push({
      name: "Start the clock",
      trigger: { type: "card_moved", columnId: second.id },
      actions: [{ type: "set_due", days: 3 }, { type: "notify", to: "assignees" }],
    });
  }
  out.push({
    name: "Fast-track bugs",
    trigger: { type: "label_set", label: "red" },
    actions: [
      ...(first ? [{ type: "move_to", columnId: first.id } as Action] : []),
      { type: "set_due", days: 1 },
    ],
  });
  return out;
}

export function RulesList({
  pageId,
  rules,
  columns,
  people,
  canEdit,
}: {
  pageId: string;
  rules: SavedRule[];
  columns: Column[];
  people: Person[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [version, setVersion] = useState(0);
  const [, startTransition] = useTransition();
  const names = {
    columns: new Map(columns.map((c) => [c.id, c.title])),
    people: new Map(people.map((p) => [p.id, p.name])),
  };

  const open = (draft: Draft) => {
    setEditing(draft);
    setVersion((v) => v + 1);
  };
  const blank: Draft = {
    name: "",
    trigger: { type: "card_moved", columnId: columns.at(-1)?.id ?? "" },
    actions: [{ type: "notify", to: "assignees" }],
  };

  const toggle = (rule: SavedRule, enabled: boolean) =>
    startTransition(async () => {
      const result = await setAutomationEnabled(rule.id, enabled);
      if (!result.ok) return void toast.error("Couldn't change the rule", { description: result.error });
      toast.success(enabled ? `“${rule.name}” is on` : `“${rule.name}” is paused`);
      router.refresh();
    });

  const remove = (rule: SavedRule) =>
    startTransition(async () => {
      const result = await deleteAutomation(rule.id);
      if (!result.ok) return void toast.error("Couldn't delete the rule", { description: result.error });
      toast.success(`Deleted “${rule.name}”`);
      router.refresh();
    });

  return (
    <section aria-labelledby="rules-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="rules-heading" className="text-lg font-semibold">
          Rules
        </h2>
        {canEdit && (
          <Button variant="brand" size="sm" onClick={() => open(blank)}>
            <Plus aria-hidden="true" /> New rule
          </Button>
        )}
      </div>

      {rules.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-card p-6">
          <Workflow className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="mt-2 font-medium">No rules yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Rules do the busywork when cards move. Start from one of these, or make your own.
          </p>
          {canEdit && (
            <ul className="mt-4 grid gap-2 sm:grid-cols-3" aria-label="Templates">
              {templates(columns).map((t) => (
                <li key={t.name}>
                  <button
                    type="button"
                    onClick={() => open(t)}
                    className="flex h-full w-full flex-col items-start gap-1 rounded-xl border bg-background p-3 text-left text-sm hover:border-brand"
                  >
                    <span className="font-medium">{t.name}</span>
                    <span className="text-muted-foreground">{describeRule(t, names)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl border bg-card" aria-label="Rules">
          {rules.map((rule) => (
            <li key={rule.id} className="flex items-start gap-3 px-4 py-3">
              <Workflow className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{rule.name}</p>
                <p className="text-sm text-muted-foreground">{describeRule(rule, names)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {rule.runCount === 0
                    ? "Hasn't run yet"
                    : `Ran ${rule.runCount} ${rule.runCount === 1 ? "time" : "times"}, last ${timeAgo(new Date(rule.lastRunAt!))}`}
                </p>
              </div>
              <Switch
                checked={rule.enabled}
                disabled={!canEdit}
                onCheckedChange={(on) => toggle(rule, on)}
                aria-label={`${rule.name} is ${rule.enabled ? "on" : "off"}`}
              />
              {canEdit && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Options for ${rule.name}`}>
                      <MoreHorizontal aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => open(rule)}>
                      <Pencil aria-hidden="true" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onSelect={() => remove(rule)}>
                      <Trash2 aria-hidden="true" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <RuleBuilder
          key={version}
          open
          onOpenChange={(o) => !o && setEditing(null)}
          pageId={pageId}
          initial={editing}
          columns={columns}
          people={people}
        />
      )}
    </section>
  );
}
