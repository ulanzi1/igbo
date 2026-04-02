import "server-only";
// Portal role stub — implementation deferred to P-0.3B/P-0.4
// This file provides the export shape for the ./portal-role subpath

export type PortalRole = "JOB_SEEKER" | "EMPLOYER" | "JOB_ADMIN";

/**
 * Get the active portal role for the current session.
 * Implementation deferred to P-0.3B (cross-subdomain SSO).
 */
export async function getActivePortalRole(): Promise<PortalRole | null> {
  // Stub: returns null until P-0.3B implements role-switching
  return null;
}
