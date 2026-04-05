import "server-only";
import { auth } from "@igbo/auth";
import { withApiHandler } from "@/lib/api-middleware";
import { ApiError } from "@/lib/api-error";
import { successResponse } from "@/lib/api-response";
import {
  getRoleByName,
  assignUserRole,
  getUserPortalRoles,
} from "@igbo/db/queries/auth-permissions";

const SELF_SERVICE_ROLES = ["JOB_SEEKER", "EMPLOYER"] as const;
type SelfServiceRole = (typeof SELF_SERVICE_ROLES)[number];

export const POST = withApiHandler(async (req: Request): Promise<Response> => {
  // 1. Auth check
  const session = await auth();
  if (!session?.user) {
    throw new ApiError({ title: "Authentication required", status: 401 });
  }

  // 2. Parse + validate body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid JSON body" });
  }
  const role = (body as { role?: string })?.role;
  if (!role || !SELF_SERVICE_ROLES.includes(role as SelfServiceRole)) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: `Invalid role. Must be one of: ${SELF_SERVICE_ROLES.join(", ")}`,
    });
  }

  // 3. Any-role 409 guard (first-time selection only)
  const existingRoles = await getUserPortalRoles(session.user.id);
  if (existingRoles.length > 0) {
    // Do not expose which roles the user holds — return 409 with no role detail
    throw new ApiError({
      title: "Role already assigned",
      status: 409,
      detail: "You already have a portal role. Use role settings to manage roles.",
    });
  }

  // 4. Look up role row
  const roleRow = await getRoleByName(role);
  if (!roleRow) {
    throw new ApiError({
      title: "Internal Server Error",
      status: 500,
      detail: "Role not found in database",
    });
  }

  // 5. Assign role (onConflictDoNothing prevents duplicate rows at DB level)
  await assignUserRole(session.user.id, roleRow.id);

  // 6. Re-read after write to detect concurrent-request race (TOCTOU guard).
  // If two tabs submitted simultaneously, only one DB row wins. The loser's
  // requested role won't appear in the post-write read → return 409 so the
  // client refreshes its session and discovers the actual assigned role.
  const assignedRoles = await getUserPortalRoles(session.user.id);
  if (!assignedRoles.includes(role as (typeof SELF_SERVICE_ROLES)[number])) {
    throw new ApiError({
      title: "Role already assigned",
      status: 409,
      detail: "A different role was already assigned. Please refresh to continue.",
    });
  }

  // 7. Return assigned role for client-side session refresh
  // TODO: check portal_employer_auto_approve when admin toggle is implemented
  return successResponse({ role, activePortalRole: role }, undefined, 201);
});
