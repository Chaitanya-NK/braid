import { BoardChangesView, DocDiffView } from "@/components/branch/diff-views";
import { MemberAvatar } from "@/components/member-avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Recap } from "@/lib/session-recap";

type Member = { id: string; name: string; color: string };

/**
 * "Who did what, and what changed", from a stretch of a page's Rewind
 * history. Used by session recaps and Catch-up.
 */
export function ChangeReport({
  recap,
  kind,
  members,
  alsoPresent = [],
  exclude,
  peopleDescription,
}: {
  recap: Recap;
  kind: "doc" | "board" | "canvas";
  members: Member[];
  /** People to list even if they made no edits (e.g. who joined a session). */
  alsoPresent?: string[];
  /** Someone to leave out of "who did what" (e.g. you, in Catch-up). */
  exclude?: string;
  peopleDescription: string;
}) {
  const person = (id: string | null) =>
    id === null
      ? { name: "Braid automations", color: "#52525b" }
      : (members.find((m) => m.id === id) ?? { name: "Someone who left", color: "#a1a1aa" });
  const ids = [...new Set<string | null>([...alsoPresent, ...recap.people.map((p) => p.userId)])].filter(
    (id) => id !== exclude,
  );
  const people = ids
    .map((id) => ({ id, ...person(id), edits: recap.people.find((p) => p.userId === id)?.edits ?? 0 }))
    .sort((a, b) => b.edits - a.edits);
  const totalEdits = people.reduce((n, p) => n + p.edits, 0) || 1;
  const changeCount = recap.doc ? recap.doc.added + recap.doc.removed + recap.doc.changed : (recap.board?.length ?? 0);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="People" value={people.length} />
        <Stat label="Steps in Rewind" value={recap.stepCount} />
        <Stat
          label={kind === "doc" ? "Lines changed" : kind === "board" ? "Board changes" : "Canvas changes"}
          value={changeCount}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Who did what</CardTitle>
          <CardDescription>{peopleDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul aria-label="People" className="flex flex-col gap-3">
            {people.map((p) => (
              <li key={p.id ?? "braid"} className="flex items-center gap-3">
                <MemberAvatar name={p.name} color={p.color} />
                <span className="w-40 truncate text-sm font-medium">{p.name}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-sunken">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${Math.round((p.edits / totalEdits) * 100)}%`, background: p.color }}
                  />
                </span>
                <span className="w-24 text-right text-sm text-muted-foreground tabular-nums">
                  {p.edits === 0 ? "watched" : `${p.edits} ${p.edits === 1 ? "edit" : "edits"}`}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <section aria-labelledby="changed-heading" className="flex flex-col gap-3">
        <h2 id="changed-heading" className="text-lg font-semibold">
          What changed
        </h2>
        {changeCount === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing on the page changed overall.</p>
        ) : recap.doc ? (
          <DocDiffView rows={recap.doc.rows} label="What changed" />
        ) : (
          <BoardChangesView changes={recap.board ?? []} label="What changed" />
        )}
      </section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-3xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
