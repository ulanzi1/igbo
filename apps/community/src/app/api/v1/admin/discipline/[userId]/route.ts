import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAdminSession } from "@igbo/auth/admin-auth";
import { findUserById } from "@igbo/db/queries/auth-queries";
import {
  listMemberDisciplineHistory,
  getActiveSuspension,
} from "@igbo/db/queries/member-discipline";
import { getProfileByUserId } from "@igbo/db/queries/community-profiles";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET = withApiHandler(async (request: Request) => {
  await requireAdminSession(request);

  const userId = new URL(request.url).pathname.split("/").at(-1) ?? "";
  if (!UUID_RE.test(userId)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid user ID" });
  }

  const user = await findUserById(userId);
  if (!user) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "User not found" });
  }

  const [disciplineHistory, activeSuspension, profile] = await Promise.all([
    listMemberDisciplineHistory(userId),
    getActiveSuspension(userId),
    getProfileByUserId(userId),
  ]);

  return successResponse({
    user: {
      id: user.id,
      name: user.name,
      displayName: profile?.displayName ?? user.name,
      email: user.email,
      accountStatus: user.accountStatus,
    },
    disciplineHistory,
    activeSuspension,
  });
});
