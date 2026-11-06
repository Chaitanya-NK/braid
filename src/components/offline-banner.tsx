"use client";

import { WifiOff } from "lucide-react";
import { useOffline } from "next/offline";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Shown at the top of the workspace whenever Next.js detects the network is
 * down (browser offline event, or a navigation/Server Action that couldn't
 * reach the server). Next.js retries those requests by itself when it's back.
 */
export function OfflineBanner() {
  const offline = useOffline();
  if (!offline) return null;
  return (
    <Alert variant="warning" role="status" className="rounded-none border-x-0 border-t-0">
      <WifiOff aria-hidden="true" />
      <AlertTitle>You&apos;re offline</AlertTitle>
      <AlertDescription>
        Docs and boards you have open keep working, and your edits are saved on this device. Opening other pages
        will wait until you&apos;re back online.
      </AlertDescription>
    </Alert>
  );
}
