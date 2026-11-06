"use client";

import { useActionState } from "react";
import { Button, FormError, Input, Label } from "@/components/ui";
import { renameWorkspace } from "@/lib/actions";

export function RenameWorkspaceForm({ workspaceId, name }: { workspaceId: string; name: string }) {
  const [state, action, pending] = useActionState(renameWorkspace, undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <Label htmlFor="ws-rename">Workspace name</Label>
      <div className="flex flex-wrap gap-2">
        <Input id="ws-rename" name="name" defaultValue={name} required minLength={2} maxLength={60} className="max-w-sm" />
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      <FormError message={state?.error} />
      {state && !state.error && !pending && <p className="text-sm text-green-700">Saved</p>}
    </form>
  );
}
