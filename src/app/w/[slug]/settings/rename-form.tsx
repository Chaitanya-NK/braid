"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { renameWorkspace } from "@/lib/actions";

export function RenameWorkspaceForm({ workspaceId, name }: { workspaceId: string; name: string }) {
  const [state, action, pending] = useActionState(renameWorkspace, undefined);

  useEffect(() => {
    if (state?.savedAt) toast.success("Workspace renamed");
    if (state?.error) toast.error("Couldn't rename the workspace", { description: state.error });
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <Label htmlFor="ws-rename">Workspace name</Label>
      <div className="flex flex-wrap gap-2">
        <Input
          id="ws-rename"
          name="name"
          defaultValue={name}
          required
          minLength={2}
          maxLength={60}
          className="max-w-sm"
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      <FormError message={state?.error} />
    </form>
  );
}
