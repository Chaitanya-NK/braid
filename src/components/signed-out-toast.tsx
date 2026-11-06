"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

/** Shows "Signed out" after the full-page redirect from the account menu. */
export function SignedOutToast() {
  const signedOut = useSearchParams().get("signed-out");
  useEffect(() => {
    if (!signedOut) return;
    toast.success("Signed out");
    window.history.replaceState(null, "", window.location.pathname);
  }, [signedOut]);
  return null;
}
