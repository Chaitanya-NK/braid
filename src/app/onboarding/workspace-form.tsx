"use client";

import { useActionState, useState } from "react";
import { Button, FormError, Input, Label } from "@/components/ui";
import { createWorkspace } from "@/lib/actions";
import { slugify } from "@/lib/utils";

export function WorkspaceForm() {
  const [state, action, pending] = useActionState(createWorkspace, undefined);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
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
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ws-slug">Workspace URL</Label>
        <div className="flex items-center overflow-hidden rounded-lg border border-zinc-400 bg-surface focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
          <span className="pl-3.5 font-mono text-sm text-muted">/w/</span>
          <input
            id="ws-slug"
            name="slug"
            required
            pattern="[a-z0-9\-]{3,40}"
            title="3–40 lowercase letters, numbers or dashes"
            className="min-w-0 flex-1 bg-transparent py-2.5 pl-0.5 pr-3.5 font-mono text-sm focus:outline-none"
            value={slug}
            onChange={(e) => {
              setSlugEdited(true);
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
            }}
          />
        </div>
      </div>
      <FormError message={state?.error} />
      <Button type="submit" variant="brand" className="min-h-12 text-base" disabled={pending}>
        {pending ? "Creating…" : "Create workspace"}
      </Button>
    </form>
  );
}
