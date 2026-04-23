import "server-only";
import { z } from "zod/v4";
import { auth } from "@igbo/auth";
import { withApiHandler } from "@/lib/api-middleware";
import { ApiError } from "@/lib/api-error";
import { successResponse } from "@/lib/api-response";
import * as conversationService from "@/services/conversation-service";

const sendMessageSchema = z.object({
  content: z.string().min(1).max(5000),
  contentType: z.enum(["text"]).optional().default("text"),
  parentMessageId: z.string().uuid().nullable().optional(),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractApplicationId(url: string): string {
  const segments = new URL(url).pathname.split("/");
  // /api/v1/conversations/{applicationId}/messages
  const idx = segments.indexOf("messages");
  return segments[idx - 1] ?? "";
}

function parseLimit(param: string | null): number | undefined {
  if (!param) return undefined;
  const n = parseInt(param, 10);
  if (!Number.isFinite(n) || n < 1) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "limit must be a positive integer",
    });
  }
  return n;
}

export const POST = withApiHandler(async (req: Request): Promise<Response> => {
  const session = await auth();
  if (!session?.user) {
    throw new ApiError({ title: "Authentication required", status: 401 });
  }

  const applicationId = extractApplicationId(req.url);
  if (!applicationId || !UUID_RE.test(applicationId)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid applicationId" });
  }

  const activePortalRole = session.user.activePortalRole as "EMPLOYER" | "JOB_SEEKER" | undefined;
  if (!activePortalRole) {
    throw new ApiError({ title: "Forbidden", status: 403, detail: "No portal role selected" });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid JSON body" });
  }

  const parsed = sendMessageSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: parsed.error.issues[0]?.message ?? "Validation failed",
    });
  }

  const result = await conversationService.sendMessage({
    applicationId,
    senderId: session.user.id,
    senderPortalRole: activePortalRole,
    content: parsed.data.content,
    contentType: parsed.data.contentType,
    parentMessageId: parsed.data.parentMessageId,
  });

  return successResponse(
    {
      conversationId: result.conversationId,
      message: result.message,
      conversationCreated: result.conversationCreated,
    },
    undefined,
    201,
  );
});

export const GET = withApiHandler(async (req: Request): Promise<Response> => {
  const session = await auth();
  if (!session?.user) {
    throw new ApiError({ title: "Authentication required", status: 401 });
  }

  const applicationId = extractApplicationId(req.url);
  if (!applicationId || !UUID_RE.test(applicationId)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid applicationId" });
  }

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limit = parseLimit(url.searchParams.get("limit"));

  const result = await conversationService.getPortalConversationMessages(
    applicationId,
    session.user.id,
    { cursor, limit },
  );

  return successResponse(result);
});
