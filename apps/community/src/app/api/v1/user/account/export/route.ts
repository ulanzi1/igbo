import { withApiHandler } from "@/server/api/middleware";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { requestDataExport } from "@/services/gdpr-service";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

const handler = async () => {
  const { userId } = await requireAuthenticatedSession();

  const { requestId } = await requestDataExport(userId);

  return new Response(
    JSON.stringify({
      data: { requestId },
    }),
    {
      status: 202,
      headers: { "Content-Type": "application/json" },
    },
  );
};

export const POST = withApiHandler(handler, {
  rateLimit: {
    key: async (req) => {
      return `gdpr-export:${req.headers.get("x-client-ip") ?? "anonymous"}`;
    },
    ...RATE_LIMIT_PRESETS.GDPR_EXPORT,
  },
});
