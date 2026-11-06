import { Suspense } from "react";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
        <p className="mt-2 text-muted">Sign in to your workspace.</p>
      </div>
      <Suspense>
        <AuthForm mode="sign-in" />
      </Suspense>
    </>
  );
}
