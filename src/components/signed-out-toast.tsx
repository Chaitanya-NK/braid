"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

/** Shows "Signed out" after the full-page redirect from the account menu. */
export function SignedOutToast() {
  const signedOut = useSearchParams().get("signed-out");
  useEffect(() => {
    if (!signedOut) return;
    // Fixed id so React dev mode running effects twice shows one toast, not two.
    toast.success("Signed out", { id: "signed-out" });
    window.history.replaceState(null, "", window.location.pathname);
  }, [signedOut]);
  return null;
}
