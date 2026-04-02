import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { getRedisClient } from "@/lib/redis";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

// GET   /api/v1/user/dnd  → { dnd: boolean }
// PATCH /api/v1/user/dnd  body: { enabled: boolean }
//                         → { ok: true, dnd: boolean }

const rateLimitConfig = {
  key: async () => {
    const { requireAuthenticatedSession: getSession } = await import("@igbo/auth/permissions");
    const { userId } = await getSession();
    return `dnd-toggle:${userId}`;
  },
  ...RATE_LIMIT_PRESETS.DND_TOGGLE,
};

const getHandler = async () => {
  const { userId } = await requireAuthenticatedSession();
  const redis = getRedisClient();
  const exists = await redis.exists(`dnd:${userId}`);
  return successResponse({ dnd: exists === 1 });
};

const patchHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid JSON body" });
  }

  const { enabled } = body as { enabled?: unknown };

  if (typeof enabled !== "boolean") {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "Field 'enabled' must be a boolean",
    });
  }

  const redis = getRedisClient();
  const key = `dnd:${userId}`;

  if (enabled) {
    await redis.set(key, "1");
  } else {
    await redis.del(key);
  }

  return successResponse({ ok: true, dnd: enabled });
};

export const GET = withApiHandler(getHandler, { rateLimit: rateLimitConfig });
export const PATCH = withApiHandler(patchHandler, { rateLimit: rateLimitConfig });
