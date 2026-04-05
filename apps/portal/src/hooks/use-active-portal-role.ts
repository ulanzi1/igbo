"use client";

import { useSession } from "next-auth/react";

export type PortalRole = "JOB_SEEKER" | "EMPLOYER" | "JOB_ADMIN" | null;

export interface ActivePortalRole {
  role: PortalRole;
  isSeeker: boolean;
  isEmployer: boolean;
  isAdmin: boolean;
  isAuthenticated: boolean;
  allRoles: Exclude<PortalRole, null>[];
  hasMultipleRoles: boolean;
}

export function useActivePortalRole(): ActivePortalRole {
  const { data: session, status } = useSession();

  if (status === "unauthenticated" || !session) {
    return {
      role: null,
      isSeeker: false,
      isEmployer: false,
      isAdmin: false,
      isAuthenticated: false,
      allRoles: [],
      hasMultipleRoles: false,
    };
  }

  // portalRoles array: populated by JWT callback on sign-in and refreshed on role switch.
  // The JWT array never contains null — Exclude<PortalRole, null> is the correct type.
  const rawPortalRoles = (session as { user?: { portalRoles?: string[] } }).user?.portalRoles;
  const allRoles = (rawPortalRoles ?? []).filter(
    (r): r is Exclude<PortalRole, null> =>
      r === "JOB_SEEKER" || r === "EMPLOYER" || r === "JOB_ADMIN",
  );

  // activePortalRole is set by @igbo/auth JWT callback.
  // Returns null when user has no portal roles (not yet selected).
  const rawRole = (session as { user?: { activePortalRole?: string } }).user?.activePortalRole;
  const role: PortalRole =
    allRoles.length === 0
      ? null
      : rawRole === "EMPLOYER"
        ? "EMPLOYER"
        : rawRole === "JOB_ADMIN"
          ? "JOB_ADMIN"
          : rawRole === "JOB_SEEKER"
            ? "JOB_SEEKER"
            : allRoles[0]!; // stale JWT: activePortalRole missing, fall back to first assigned role (allRoles.length > 0 guaranteed by outer guard)

  return {
    role,
    isSeeker: role === "JOB_SEEKER",
    isEmployer: role === "EMPLOYER",
    isAdmin: role === "JOB_ADMIN",
    isAuthenticated: true,
    allRoles,
    hasMultipleRoles: allRoles.length > 1,
  };
}
