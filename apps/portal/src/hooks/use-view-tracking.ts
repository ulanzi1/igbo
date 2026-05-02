"use client";
import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";

const DWELL_THRESHOLD_MS = 2000;
const DEBOUNCE_INTERVAL_MS = 5000;

/**
 * Tracks when an employer has intentionally viewed a candidate's application.
 * Fires a POST to /api/v1/applications/{applicationId}/viewed after the dwell threshold
 * (2 seconds) has elapsed. Clears the timer if the panel is closed before the threshold.
 *
 * Only fires for EMPLOYER role. Debounces rapid open/close/open sequences
 * (minimum 5s between POST calls per applicationId).
 *
 * Silent failure: network errors are swallowed — this is a non-critical analytics action.
 */
export function useViewTracking(applicationId: string | null): void {
  const { data: session, status } = useSession();
  const lastSentRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!applicationId) return;
    // Guard on status AND role — do not fire while session is loading or for non-employers
    if (status !== "authenticated") return;
    if (session?.user?.activePortalRole !== "EMPLOYER") return;

    const timer = setTimeout(async () => {
      const now = Date.now();
      const lastSent = lastSentRef.current[applicationId] ?? 0;
      if (now - lastSent < DEBOUNCE_INTERVAL_MS) return;

      lastSentRef.current[applicationId] = now;
      try {
        await fetch(`/api/v1/applications/${applicationId}/viewed`, {
          method: "POST",
        });
      } catch {
        // Silent failure — non-critical client action
      }
    }, DWELL_THRESHOLD_MS);

    return () => clearTimeout(timer);
  }, [applicationId, session?.user?.activePortalRole, status]);
}
