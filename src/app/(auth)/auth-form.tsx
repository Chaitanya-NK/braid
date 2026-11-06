"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button, FormError, Input, Label } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

/** Only allow redirects back into the app, never to another site. */
function safeNext(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/app";
}

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));

    const result =
      mode === "sign-up"
        ? await authClient.signUp.email({ name: String(form.get("name")), email, password })
        : await authClient.signIn.email({ email, password });

    if (result.error) {
      setError(result.error.message ?? "Something went wrong. Try again.");
      setPending(false);
      return;
    }
    router.push(next);
    router.refresh();
  }

  const isSignUp = mode === "sign-up";

  return (
    // method="post" keeps the password out of the URL if someone submits
    // before the page's JavaScript has loaded.
    <form method="post" onSubmit={onSubmit} className="flex flex-col gap-4">
      {isSignUp && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" autoComplete="name" required minLength={2} />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={isSignUp ? "new-password" : "current-password"}
          required
          minLength={8}
        />
        {isSignUp && <span className="text-xs text-muted">At least 8 characters</span>}
      </div>
      <FormError message={error} />
      <Button type="submit" variant="brand" className="min-h-12 text-base" disabled={pending}>
        {pending ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-muted">
        {isSignUp ? "Already have an account? " : "New to Braid? "}
        <Link
          href={`${isSignUp ? "/sign-in" : "/sign-up"}${next !== "/app" ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-medium text-brand hover:text-brand-strong"
        >
          {isSignUp ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}
