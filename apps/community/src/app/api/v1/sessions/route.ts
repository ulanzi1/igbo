import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { requireAuthenticatedSession } from "@/services/permissions";
import { getUserSessions } from "@/services/auth-service";

export const GET = withApiHandler(async () => {
  const { userId } = await requireAuthenticatedSession();
  const sessions = await getUserSessions(userId);

  const data = sessions.map((s) => ({
    id: s.id,
    deviceName: s.deviceName,
    deviceIp: s.deviceIp,
    lastActiveAt: s.lastActiveAt.toISOString(),
    createdAt: s.createdAt.toISOString(),
    expiresAt: s.expires.toISOString(),
  }));

  return successResponse(data);
});
