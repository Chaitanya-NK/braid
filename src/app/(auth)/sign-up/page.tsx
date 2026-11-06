import { Suspense } from "react";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create your account</h1>
        <p className="mt-2 text-muted">Step 1 of 2 · then name your workspace</p>
      </div>
      <Suspense>
        <AuthForm mode="sign-up" />
      </Suspense>
    </>
  );
}
