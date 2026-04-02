// GET /api/v1/groups/[groupId]  — group detail
// PATCH /api/v1/groups/[groupId] — update group settings (creator/leader only)
import { z } from "zod/v4";
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { getGroupById, getGroupMember, listPendingMembers } from "@igbo/db/queries/groups";
import { updateGroupSettings } from "@/services/group-service";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

// ── GET /api/v1/groups/[groupId] ──────────────────────────────────────────────

const getHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();

  const groupId = new URL(request.url).pathname.split("/").at(-1);
  if (!groupId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Missing groupId" });
  }

  const group = await getGroupById(groupId);
  if (!group) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Group not found" });
  }

  const viewerMembership = await getGroupMember(groupId, userId);
  const isLeaderOrCreator =
    viewerMembership?.role === "creator" || viewerMembership?.role === "leader";

  // Include pending requests for leaders/creators
  const pendingRequests = isLeaderOrCreator ? await listPendingMembers(groupId) : [];

  return successResponse({
    group: {
      id: group.id,
      name: group.name,
      description: group.description,
      bannerUrl: group.bannerUrl,
      visibility: group.visibility,
      joinType: group.joinType,
      postingPermission: group.postingPermission,
      commentingPermission: group.commentingPermission,
      memberLimit: group.memberLimit,
      memberCount: group.memberCount,
      creatorId: group.creatorId,
      createdAt: group.createdAt instanceof Date ? group.createdAt.toISOString() : group.createdAt,
      updatedAt: group.updatedAt instanceof Date ? group.updatedAt.toISOString() : group.updatedAt,
    },
    viewerMembership: viewerMembership
      ? { role: viewerMembership.role, status: viewerMembership.status }
      : null,
    pendingRequests: pendingRequests.map((r) => ({
      userId: r.userId,
      displayName: r.displayName ?? null,
      joinedAt: r.joinedAt instanceof Date ? r.joinedAt.toISOString() : r.joinedAt,
    })),
  });
};

export const GET = withApiHandler(getHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@igbo/auth/permissions");
      const { userId } = await getSession();
      return `group-detail:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.GROUP_DETAIL,
  },
});

// ── PATCH /api/v1/groups/[groupId] ────────────────────────────────────────────

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).nullable().optional(),
  bannerUrl: z.string().nullable().optional(),
  visibility: z.enum(["public", "private", "hidden"]).optional(),
  joinType: z.enum(["open", "approval"]).optional(),
  postingPermission: z.enum(["all_members", "leaders_only", "moderated"]).optional(),
  commentingPermission: z.enum(["open", "members_only", "disabled"]).optional(),
  memberLimit: z.number().int().positive().nullable().optional(),
});

const patchHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();

  const groupId = new URL(request.url).pathname.split("/").at(-1);
  if (!groupId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Missing groupId" });
  }

  const body: unknown = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Unprocessable Entity",
      status: 422,
      detail: parsed.error.issues[0]?.message ?? "Invalid input",
    });
  }

  const updated = await updateGroupSettings(userId, groupId, parsed.data);

  return successResponse({
    group: {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      bannerUrl: updated.bannerUrl,
      visibility: updated.visibility,
      joinType: updated.joinType,
      postingPermission: updated.postingPermission,
      commentingPermission: updated.commentingPermission,
      memberLimit: updated.memberLimit,
      memberCount: updated.memberCount,
      creatorId: updated.creatorId,
      updatedAt:
        updated.updatedAt instanceof Date ? updated.updatedAt.toISOString() : updated.updatedAt,
    },
  });
};

export const PATCH = withApiHandler(patchHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@igbo/auth/permissions");
      const { userId } = await getSession();
      return `group-update:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.GROUP_UPDATE,
  },
});
