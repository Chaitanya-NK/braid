"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const isSignUp = mode === "sign-up";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    const name = String(form.get("name") ?? "");

    const result = isSignUp
      ? await authClient.signUp.email({ name, email, password })
      : await authClient.signIn.email({ email, password });

    if (result.error) {
      // Inline, so it stays readable next to the fields.
      setError(
        result.error.status === 429
          ? "Too many attempts. Wait a few seconds and try again."
          : (result.error.message ?? "Something went wrong. Try again."),
      );
      setPending(false);
      return;
    }
    toast.success(isSignUp ? `Welcome to Braid, ${name.split(" ")[0]}!` : "Welcome back");
    router.push(next);
    router.refresh();
  }

  return (
    // method="post" keeps the password out of the URL if someone submits
    // before the page's JavaScript has loaded.
    <form method="post" onSubmit={onSubmit} className="flex flex-col gap-4">
      {isSignUp && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" autoComplete="name" required minLength={2} />
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={isSignUp ? "new-password" : "current-password"}
          required
          minLength={8}
        />
        {isSignUp && <span className="text-xs text-muted-foreground">At least 8 characters</span>}
      </div>
      <FormError message={error} />
      <Button type="submit" variant="brand" size="lg" disabled={pending}>
        {pending ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
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
