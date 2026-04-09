"use client";

import * as React from "react";

interface SeekerProfileViewTrackerProps {
  seekerProfileId: string;
  viewerUserId: string;
  profileOwnerUserId: string;
}

/**
 * Fire-and-forget component that tracks a seeker profile view on mount.
 * Self-views are excluded client-side (API also enforces this server-side).
 * No UI output — renders null.
 */
export function SeekerProfileViewTracker({
  seekerProfileId,
  viewerUserId,
  profileOwnerUserId,
}: SeekerProfileViewTrackerProps) {
  React.useEffect(() => {
    if (viewerUserId === profileOwnerUserId) return;

    // Fire-and-forget — view tracking is non-critical. Same-origin POST; the
    // browser sets `Origin` automatically (it is a forbidden header for fetch).
    void fetch(`/api/v1/seekers/${seekerProfileId}/view`, {
      method: "POST",
    }).catch(() => {
      console.warn("Failed to record seeker profile view");
    });
  }, [seekerProfileId, viewerUserId, profileOwnerUserId]);

  return null;
}
