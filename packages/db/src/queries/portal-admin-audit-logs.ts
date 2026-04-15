import "server-only";
import { db } from "../index";
import { auditLogs } from "../schema/audit-logs";
import { authUsers } from "../schema/auth-users";
import { and, eq, gte, lte, desc, sql, like } from "drizzle-orm";
import type { AuditLogFilters, AuditLogRow, PaginatedAuditLogs } from "./audit-logs";

export const PORTAL_AUDIT_ACTIONS = [
  "portal.posting.approve",
  "portal.posting.reject",
  "portal.posting.request_changes",
  "portal.flag.create",
  "portal.flag.resolve",
  "portal.flag.dismiss",
  "portal.report.submit",
  "portal.report.resolve",
  "portal.report.dismiss",
  "portal.verification.submit",
  "portal.verification.approve",
  "portal.verification.reject",
  "portal.blocklist.add",
  "portal.blocklist.update",
  "portal.blocklist.delete",
] as const;

export type PortalAuditAction = (typeof PORTAL_AUDIT_ACTIONS)[number];

const PORTAL_PREFIX_CONDITION = like(auditLogs.action, "portal.%");

const SELECT_FIELDS = {
  id: auditLogs.id,
  actorId: auditLogs.actorId,
  actorName: authUsers.name,
  action: auditLogs.action,
  targetUserId: auditLogs.targetUserId,
  targetType: auditLogs.targetType,
  traceId: auditLogs.traceId,
  details: auditLogs.details,
  createdAt: auditLogs.createdAt,
};

export async function listPortalAdminAuditLogs(
  page: number,
  limit: number,
  filters: AuditLogFilters = {},
): Promise<PaginatedAuditLogs> {
  const conditions = [PORTAL_PREFIX_CONDITION];

  if (filters.action) {
    conditions.push(eq(auditLogs.action, filters.action));
  }
  if (filters.actorId) {
    conditions.push(eq(auditLogs.actorId, filters.actorId));
  }
  if (filters.targetType) {
    conditions.push(eq(auditLogs.targetType, filters.targetType));
  }
  if (filters.dateFrom) {
    conditions.push(gte(auditLogs.createdAt, new Date(`${filters.dateFrom}T00:00:00Z`)));
  }
  if (filters.dateTo) {
    conditions.push(lte(auditLogs.createdAt, new Date(`${filters.dateTo}T23:59:59Z`)));
  }

  const where = and(...conditions);
  const offset = (page - 1) * limit;

  const [rows, countResult] = await Promise.all([
    db
      .select(SELECT_FIELDS)
      .from(auditLogs)
      .leftJoin(authUsers, eq(auditLogs.actorId, authUsers.id))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(where),
  ]);

  const total = countResult[0]?.count ?? 0;
  return {
    logs: rows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function listPortalAdminAuditLogsForExport(
  filters: AuditLogFilters = {},
): Promise<AuditLogRow[]> {
  const conditions = [PORTAL_PREFIX_CONDITION];

  if (filters.action) {
    conditions.push(eq(auditLogs.action, filters.action));
  }
  if (filters.actorId) {
    conditions.push(eq(auditLogs.actorId, filters.actorId));
  }
  if (filters.targetType) {
    conditions.push(eq(auditLogs.targetType, filters.targetType));
  }
  if (filters.dateFrom) {
    conditions.push(gte(auditLogs.createdAt, new Date(`${filters.dateFrom}T00:00:00Z`)));
  }
  if (filters.dateTo) {
    conditions.push(lte(auditLogs.createdAt, new Date(`${filters.dateTo}T23:59:59Z`)));
  }

  const where = and(...conditions);

  return db
    .select(SELECT_FIELDS)
    .from(auditLogs)
    .leftJoin(authUsers, eq(auditLogs.actorId, authUsers.id))
    .where(where)
    .orderBy(desc(auditLogs.createdAt));
}

export async function getDistinctPortalAuditAdmins(): Promise<{ id: string; name: string }[]> {
  const rows = await db
    .select({ id: auditLogs.actorId, name: authUsers.name })
    .from(auditLogs)
    .innerJoin(authUsers, eq(auditLogs.actorId, authUsers.id))
    .where(PORTAL_PREFIX_CONDITION)
    .groupBy(auditLogs.actorId, authUsers.name)
    .orderBy(authUsers.name);

  return rows.map((r) => ({ id: r.id, name: r.name ?? "Unknown" }));
}
