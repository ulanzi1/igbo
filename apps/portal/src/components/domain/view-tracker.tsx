"use client";

import * as React from "react";
import { useSession } from "next-auth/react";

interface ViewTrackerProps {
  jobId: string;
}

/**
 * Fire-and-forget component that tracks a job view on mount.
 * Only fires when the user is authenticated. No UI output.
 */
export function ViewTracker({ jobId }: ViewTrackerProps) {
  const { data: session } = useSession();

  const userId = session?.user?.id;

  React.useEffect(() => {
    if (!userId) return;

    // Fire-and-forget — no UI feedback
    void fetch(`/api/v1/jobs/${jobId}/views`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: window.location.origin,
      },
    }).catch(() => {
      // Silently ignore errors — view tracking is non-critical
    });
  }, [jobId, userId]);

  return null;
}
