import "server-only";
import { withApiHandler } from "@/lib/api-middleware";
import { requireJobAdminRole } from "@/lib/portal-permissions";
import { successResponse, errorResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { listScreeningKeywords } from "@igbo/db/queries/portal-screening-keywords";
import { portalScreeningKeywords } from "@igbo/db/schema/portal-screening-keywords";
import { auditLogs } from "@igbo/db/schema/audit-logs";
import { db } from "@igbo/db";
import { createKeywordSchema, listKeywordsQuerySchema } from "@/lib/validations/screening-keyword";

/** Postgres unique-violation SQLSTATE. */
const PG_UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === PG_UNIQUE_VIOLATION
  );
}

export const GET = withApiHandler(async (req: Request) => {
  await requireJobAdminRole();

  const url = new URL(req.url);
  const queryParsed = listKeywordsQuerySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
  });

  if (!queryParsed.success) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: queryParsed.error.issues[0]?.message,
    });
  }

  const { limit, offset, category } = queryParsed.data;
  const result = await listScreeningKeywords({ limit, offset, category });
  return successResponse(result);
});

export const POST = withApiHandler(async (req: Request) => {
  const session = await requireJobAdminRole();

  const body = await req.json().catch(() => null);
  if (!body) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Request body is required" });
  }

  const parsed = createKeywordSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Validation Error",
      status: 400,
      detail: parsed.error.issues[0]?.message,
    });
  }

  const { phrase, category, notes } = parsed.data;

  try {
    // Insert keyword + audit log atomically — if audit write fails, the mutation rolls back.
    const keyword = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(portalScreeningKeywords)
        .values({
          phrase,
          category,
          severity: "high",
          notes: notes ?? null,
          createdByAdminId: session.user.id,
        })
        .returning();
      if (!inserted) throw new Error("insertScreeningKeyword: no row returned");

      await tx.insert(auditLogs).values({
        actorId: session.user.id,
        action: "portal.blocklist.add",
        targetUserId: null,
        targetType: "portal_screening_keyword",
        details: { id: inserted.id, phrase, category, notes: notes ?? null },
      });

      return inserted;
    });

    return successResponse(keyword, undefined, 201);
  } catch (err) {
    // Pg unique_violation (SQLSTATE 23505) = duplicate phrase
    if (isUniqueViolation(err)) {
      return errorResponse({
        type: "about:blank",
        title: "Conflict",
        status: 409,
        detail: "This phrase already exists in the blocklist.",
      });
    }
    throw err;
  }
});
