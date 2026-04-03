"use client";

import { useSession } from "next-auth/react";

export type PortalRole = "JOB_SEEKER" | "EMPLOYER" | "JOB_ADMIN" | null;

export interface ActivePortalRole {
  role: PortalRole;
  isSeeker: boolean;
  isEmployer: boolean;
  isAdmin: boolean;
  isAuthenticated: boolean;
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
    };
  }

  // activePortalRole is set by @igbo/auth JWT callback.
  // Defaults to JOB_SEEKER if user has both roles (as per AC2) or if not set.
  const rawRole = (session as { user?: { activePortalRole?: string } }).user?.activePortalRole;
  const role: PortalRole =
    rawRole === "EMPLOYER"
      ? "EMPLOYER"
      : rawRole === "JOB_ADMIN"
        ? "JOB_ADMIN"
        : "JOB_SEEKER";

  return {
    role,
    isSeeker: role === "JOB_SEEKER",
    isEmployer: role === "EMPLOYER",
    isAdmin: role === "JOB_ADMIN",
    isAuthenticated: true,
  };
}
