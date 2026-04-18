import "server-only";
import { db } from "../index";
import { portalJobPostings, portalJobStatusEnum } from "../schema/portal-job-postings";
import { portalCompanyProfiles } from "../schema/portal-company-profiles";
import { authUsers } from "../schema/auth-users";
import type { PortalJobStatus } from "../schema/portal-job-postings";
import { eq, and, isNull, isNotNull, gte, lte, count, desc } from "drizzle-orm";

export type { PortalJobStatus };

export const PORTAL_JOB_STATUS_VALUES = portalJobStatusEnum.enumValues;

export interface AdminPostingsFilterOptions {
  page: number;
  pageSize: number;
  status?: PortalJobStatus | "archived";
  companyId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface AdminPostingRow {
  id: string;
  title: string;
  status: PortalJobStatus;
  location: string | null;
  employmentType: string;
  archivedAt: Date | null;
  createdAt: Date;
  companyId: string;
  companyName: string;
  companyTrustBadge: boolean;
  employerName: string | null;
  applicationDeadline: Date | null;
}

export interface AdminPostingsListResult {
  postings: AdminPostingRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CompanyForFilter {
  id: string;
  name: string;
}

export async function listAllPostingsForAdmin(
  options: AdminPostingsFilterOptions,
): Promise<AdminPostingsListResult> {
  const { page, pageSize, status, companyId, dateFrom, dateTo } = options;
  const offset = (page - 1) * pageSize;

  const conditions: ReturnType<typeof eq>[] = [];

  if (status === "archived") {
    conditions.push(isNotNull(portalJobPostings.archivedAt) as ReturnType<typeof eq>);
  } else if (status) {
    conditions.push(eq(portalJobPostings.status, status) as ReturnType<typeof eq>);
    conditions.push(isNull(portalJobPostings.archivedAt) as ReturnType<typeof eq>);
  }
  // When no status filter: show all (including archived) — no archivedAt filter

  if (companyId) {
    conditions.push(eq(portalJobPostings.companyId, companyId) as ReturnType<typeof eq>);
  }
  if (dateFrom) {
    conditions.push(gte(portalJobPostings.createdAt, dateFrom) as ReturnType<typeof eq>);
  }
  if (dateTo) {
    conditions.push(lte(portalJobPostings.createdAt, dateTo) as ReturnType<typeof eq>);
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: portalJobPostings.id,
      title: portalJobPostings.title,
      status: portalJobPostings.status,
      location: portalJobPostings.location,
      employmentType: portalJobPostings.employmentType,
      archivedAt: portalJobPostings.archivedAt,
      createdAt: portalJobPostings.createdAt,
      companyId: portalJobPostings.companyId,
      companyName: portalCompanyProfiles.name,
      companyTrustBadge: portalCompanyProfiles.trustBadge,
      employerName: authUsers.name,
      applicationDeadline: portalJobPostings.applicationDeadline,
    })
    .from(portalJobPostings)
    .leftJoin(portalCompanyProfiles, eq(portalJobPostings.companyId, portalCompanyProfiles.id))
    .leftJoin(authUsers, eq(portalCompanyProfiles.ownerUserId, authUsers.id))
    .where(whereClause)
    .orderBy(desc(portalJobPostings.createdAt))
    .limit(pageSize)
    .offset(offset);

  const [countRow] = await db
    .select({ total: count() })
    .from(portalJobPostings)
    .leftJoin(portalCompanyProfiles, eq(portalJobPostings.companyId, portalCompanyProfiles.id))
    .where(whereClause);

  const total = countRow?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const postings: AdminPostingRow[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    location: row.location ?? null,
    employmentType: row.employmentType,
    archivedAt: row.archivedAt ?? null,
    createdAt: row.createdAt,
    companyId: row.companyId,
    companyName: row.companyName ?? "",
    companyTrustBadge: row.companyTrustBadge ?? false,
    employerName: row.employerName ?? null,
    applicationDeadline: row.applicationDeadline ?? null,
  }));

  return { postings, total, page, pageSize, totalPages };
}

export async function getCompaniesWithPostings(): Promise<CompanyForFilter[]> {
  const rows = await db
    .selectDistinct({
      id: portalCompanyProfiles.id,
      name: portalCompanyProfiles.name,
    })
    .from(portalCompanyProfiles)
    .innerJoin(portalJobPostings, eq(portalJobPostings.companyId, portalCompanyProfiles.id))
    .orderBy(portalCompanyProfiles.name);

  return rows.map((row) => ({ id: row.id, name: row.name }));
}
