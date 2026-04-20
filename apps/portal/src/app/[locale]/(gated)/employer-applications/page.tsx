import "server-only";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { requireCompanyProfile } from "@/lib/require-company-profile";
import { getApplicationsForEmployer } from "@igbo/db/queries/portal-applications";
import { EmployerApplicationsTable } from "@/components/domain/employer-applications-table";
import {
  EMPLOYER_STATUS_GROUP_MAP,
  EMPLOYER_SORT_WHITELIST,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "@/lib/employer-application-constants";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    status?: string;
    sortBy?: string;
    sortOrder?: string;
    page?: string;
    pageSize?: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Portal.employerApplications" });
  return { title: t("pageTitle") };
}

export default async function EmployerApplicationsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const company = await requireCompanyProfile(locale);
  if (!company) {
    redirect(`/${locale}`);
  }

  const raw = await searchParams;
  const t = await getTranslations("Portal.employerApplications");

  // Parse status filter
  let statusFilter: (typeof EMPLOYER_STATUS_GROUP_MAP)[string] | undefined;
  if (raw.status && raw.status !== "all") {
    const mapped = EMPLOYER_STATUS_GROUP_MAP[raw.status];
    if (mapped) {
      statusFilter = mapped;
    }
  }

  // Validate sort
  const sortBy = EMPLOYER_SORT_WHITELIST.includes(
    raw.sortBy as (typeof EMPLOYER_SORT_WHITELIST)[number],
  )
    ? raw.sortBy
    : undefined;
  const sortOrder = raw.sortOrder === "asc" || raw.sortOrder === "desc" ? raw.sortOrder : undefined;

  // Parse pagination
  const page = Math.max(1, parseInt(raw.page ?? "1", 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(raw.pageSize ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE),
  );

  const { applications, total } = await getApplicationsForEmployer(company.id, {
    statusFilter,
    sortBy,
    sortOrder,
    page,
    pageSize,
  });

  return (
    <div className="py-8">
      <h1 className="mb-6 text-2xl font-bold">{t("pageTitle")}</h1>
      <EmployerApplicationsTable initialApplications={applications} initialTotal={total} />
    </div>
  );
}
