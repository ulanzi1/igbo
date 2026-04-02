import "server-only";
import { db } from "../index";
import { auditLogs } from "../schema/audit-logs";
import { authUsers } from "../schema/auth-users";
import { and, eq, gte, lte, desc, sql } from "drizzle-orm";

export interface AuditLogFilters {
  action?: string;
  actorId?: string;
  targetType?: string;
  dateFrom?: string; // ISO date YYYY-MM-DD
  dateTo?: string; // ISO date YYYY-MM-DD
}

export interface AuditLogRow {
  id: string;
  actorId: string;
  actorName: string | null;
  action: string;
  targetUserId: string | null;
  targetType: string | null;
  traceId: string | null;
  details: unknown;
  createdAt: Date;
}

export interface PaginatedAuditLogs {
  logs: AuditLogRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function listAuditLogs(
  page: number,
  limit: number,
  filters: AuditLogFilters = {},
): Promise<PaginatedAuditLogs> {
  const conditions = [];

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

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = (page - 1) * limit;

  const [rows, countResult] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        actorId: auditLogs.actorId,
        actorName: authUsers.name,
        action: auditLogs.action,
        targetUserId: auditLogs.targetUserId,
        targetType: auditLogs.targetType,
        traceId: auditLogs.traceId,
        details: auditLogs.details,
        createdAt: auditLogs.createdAt,
      })
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
