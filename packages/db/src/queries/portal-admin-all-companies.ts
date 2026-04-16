import "server-only";
import { db } from "../index";
import { portalCompanyProfiles } from "../schema/portal-company-profiles";
import { portalEmployerVerifications } from "../schema/portal-employer-verifications";
import { portalAdminFlags } from "../schema/portal-admin-flags";
import { portalJobPostings } from "../schema/portal-job-postings";
import { authUsers } from "../schema/auth-users";
import { eq, and, isNull, count, desc, sql, type SQL } from "drizzle-orm";

export type VerificationDisplayStatus = "verified" | "pending" | "rejected" | "unverified";

export interface AdminCompaniesFilterOptions {
  page: number;
  pageSize: number;
  verification?: VerificationDisplayStatus;
}

export interface AdminCompanyRow {
  id: string;
  name: string;
  trustBadge: boolean;
  ownerName: string | null;
  verificationDisplayStatus: VerificationDisplayStatus;
  activePostingCount: number;
  openViolationCount: number;
  createdAt: Date;
}

export interface AdminCompaniesListResult {
  companies: AdminCompanyRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function deriveVerificationDisplayStatus(
  trustBadge: boolean,
  latestVerificationStatus: string | null,
): VerificationDisplayStatus {
  if (trustBadge) return "verified";
  if (!latestVerificationStatus) return "unverified";
  if (latestVerificationStatus === "pending") return "pending";
  if (latestVerificationStatus === "rejected") return "rejected";
  return "unverified";
}

const latestVerificationSql = sql<string | null>`(
  SELECT ${portalEmployerVerifications.status}
  FROM ${portalEmployerVerifications}
  WHERE ${portalEmployerVerifications.companyId} = ${portalCompanyProfiles.id}
  ORDER BY ${portalEmployerVerifications.createdAt} DESC
  LIMIT 1
)`;

const activePostingCountSql = sql<number>`(
  SELECT COUNT(*)::int
  FROM ${portalJobPostings}
  WHERE ${portalJobPostings.companyId} = ${portalCompanyProfiles.id}
    AND ${portalJobPostings.status} = 'active'
    AND ${portalJobPostings.archivedAt} IS NULL
)`;

const openViolationCountSql = sql<number>`(
  SELECT COUNT(*)::int
  FROM ${portalAdminFlags} af
  INNER JOIN ${portalJobPostings} jp ON af.posting_id = jp.id
  WHERE jp.company_id = ${portalCompanyProfiles.id}
    AND af.status = 'open'
)`;

export async function listAllCompaniesForAdmin(
  options: AdminCompaniesFilterOptions,
): Promise<AdminCompaniesListResult> {
  const { page, pageSize, verification } = options;
  const offset = (page - 1) * pageSize;

  const conditions: SQL[] = [];

  if (verification === "verified") {
    conditions.push(eq(portalCompanyProfiles.trustBadge, true));
  } else if (verification === "pending") {
    conditions.push(eq(portalCompanyProfiles.trustBadge, false));
    conditions.push(sql`${latestVerificationSql} = 'pending'`);
  } else if (verification === "rejected") {
    conditions.push(eq(portalCompanyProfiles.trustBadge, false));
    conditions.push(sql`${latestVerificationSql} = 'rejected'`);
  } else if (verification === "unverified") {
    conditions.push(eq(portalCompanyProfiles.trustBadge, false));
    conditions.push(isNull(latestVerificationSql));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: portalCompanyProfiles.id,
      name: portalCompanyProfiles.name,
      trustBadge: portalCompanyProfiles.trustBadge,
      ownerName: authUsers.name,
      createdAt: portalCompanyProfiles.createdAt,
      latestVerificationStatus: latestVerificationSql,
      activePostingCount: activePostingCountSql,
      openViolationCount: openViolationCountSql,
    })
    .from(portalCompanyProfiles)
    .leftJoin(authUsers, eq(portalCompanyProfiles.ownerUserId, authUsers.id))
    .where(whereClause)
    .orderBy(desc(portalCompanyProfiles.createdAt))
    .limit(pageSize)
    .offset(offset);

  const [countRow] = await db
    .select({ total: count() })
    .from(portalCompanyProfiles)
    .where(whereClause);

  const total = countRow?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const companies: AdminCompanyRow[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    trustBadge: row.trustBadge,
    ownerName: row.ownerName ?? null,
    verificationDisplayStatus: deriveVerificationDisplayStatus(
      row.trustBadge,
      row.latestVerificationStatus,
    ),
    activePostingCount: Number(row.activePostingCount ?? 0),
    openViolationCount: Number(row.openViolationCount ?? 0),
    createdAt: row.createdAt,
  }));

  return { companies, total, page, pageSize, totalPages };
}
