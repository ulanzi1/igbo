import "server-only";
import { withApiHandler } from "@/lib/api-middleware";
import { requireJobAdminRole } from "@/lib/portal-permissions";
import { successResponse, errorResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { getScreeningKeywordById } from "@igbo/db/queries/portal-screening-keywords";
import { portalScreeningKeywords } from "@igbo/db/schema/portal-screening-keywords";
import { auditLogs } from "@igbo/db/schema/audit-logs";
import { db } from "@igbo/db";
import { and, eq, isNull } from "drizzle-orm";
import { updateKeywordSchema } from "@/lib/validations/screening-keyword";

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

export const PATCH = withApiHandler(async (req: Request) => {
  const session = await requireJobAdminRole();

  const keywordId = new URL(req.url).pathname.split("/").at(-1) ?? "";

  const existing = await getScreeningKeywordById(keywordId);
  if (!existing) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Keyword not found" });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Request body is required" });
  }

  const parsed = updateKeywordSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Validation Error",
      status: 400,
      detail: parsed.error.issues[0]?.message,
    });
  }

  try {
    // Update keyword + audit log atomically so a failed audit rolls back the update.
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(portalScreeningKeywords)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(
          and(eq(portalScreeningKeywords.id, keywordId), isNull(portalScreeningKeywords.deletedAt)),
        )
        .returning();
      if (!row) return null;

      await tx.insert(auditLogs).values({
        actorId: session.user.id,
        action: "portal.blocklist.update",
        targetUserId: null,
        targetType: "portal_screening_keyword",
        details: {
          id: keywordId,
          phrase: row.phrase,
          category: row.category,
          notes: row.notes ?? null,
        },
      });

      return row;
    });

    if (!updated) {
      throw new ApiError({ title: "Not Found", status: 404, detail: "Keyword not found" });
    }

    return successResponse(updated);
  } catch (err) {
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

export const DELETE = withApiHandler(async (req: Request) => {
  const session = await requireJobAdminRole();

  const keywordId = new URL(req.url).pathname.split("/").at(-1) ?? "";

  const existing = await getScreeningKeywordById(keywordId);
  if (!existing) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Keyword not found" });
  }

  // Soft-delete + audit log atomically.
  const deleted = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(portalScreeningKeywords)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(eq(portalScreeningKeywords.id, keywordId), isNull(portalScreeningKeywords.deletedAt)),
      )
      .returning({ id: portalScreeningKeywords.id });
    if (!row) return false;

    await tx.insert(auditLogs).values({
      actorId: session.user.id,
      action: "portal.blocklist.delete",
      targetUserId: null,
      targetType: "portal_screening_keyword",
      details: { id: keywordId, phrase: existing.phrase, category: existing.category },
    });

    return true;
  });

  if (!deleted) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Keyword not found" });
  }

  return successResponse({ id: keywordId });
});
