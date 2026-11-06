"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { createWorkspace } from "@/lib/actions";
import { slugify } from "@/lib/utils";

export function WorkspaceForm() {
  const [state, action, pending] = useActionState(createWorkspace, undefined);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);

  // On success the action redirects, so we only ever get a state back on error.
  useEffect(() => {
    if (state?.error) toast.error("Couldn't create the workspace", { description: state.error });
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="ws-name">Workspace name</Label>
        <Input
          id="ws-name"
          name="name"
          required
          minLength={2}
          maxLength={60}
          placeholder="Weekend Builders"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugEdited) setSlug(slugify(e.target.value));
          }}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="ws-slug">Workspace URL</Label>
        <InputGroup>
          <InputGroupAddon className="font-mono font-normal">/w/</InputGroupAddon>
          <InputGroupInput
            id="ws-slug"
            name="slug"
            required
            pattern="[a-z0-9\-]{3,40}"
            title="3–40 lowercase letters, numbers or dashes"
            className="font-mono text-sm"
            value={slug}
            onChange={(e) => {
              setSlugEdited(true);
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
            }}
          />
        </InputGroup>
      </div>
      <FormError message={state?.error} />
      <Button type="submit" variant="brand" size="lg" disabled={pending}>
        {pending ? "Creating…" : "Create workspace"}
      </Button>
    </form>
  );
}
