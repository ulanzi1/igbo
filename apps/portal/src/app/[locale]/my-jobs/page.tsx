import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { requireCompanyProfile } from "@/lib/require-company-profile";
import { getJobPostingsByCompanyIdWithFilter } from "@igbo/db/queries/portal-job-postings";
import { portalJobStatusEnum } from "@igbo/db/schema/portal-job-postings";
import { JobPostingCard } from "@/components/domain/job-posting-card";
import { PostingStatusActions } from "@/components/domain/posting-status-actions";
import { redirect } from "next/navigation";
import type { PortalJobStatus } from "@igbo/db/schema/portal-job-postings";

type MyJobsFilter = PortalJobStatus | "archived";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
}

// Statuses shown as active filter tabs
const FILTER_TABS: PortalJobStatus[] = [
  "draft",
  "pending_review",
  "active",
  "paused",
  "filled",
  "expired",
  "rejected",
];

export default async function MyJobsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { status: rawStatus } = await searchParams;
  const t = await getTranslations("Portal.myJobs");
  const pt = await getTranslations("Portal.posting");
  const lt = await getTranslations("Portal.lifecycle");

  const profile = await requireCompanyProfile(locale);
  if (!profile) {
    redirect(`/${locale}`);
  }

  // Validate status param — "archived" must be checked before enum check
  const validFilter: MyJobsFilter | undefined =
    rawStatus === "archived"
      ? "archived"
      : portalJobStatusEnum.enumValues.includes(rawStatus as PortalJobStatus)
        ? (rawStatus as PortalJobStatus)
        : undefined;

  // Fetch all postings for tab counts, filter in-memory for display
  const allPostings = await getJobPostingsByCompanyIdWithFilter(profile.id);
  const archivedPostings = await getJobPostingsByCompanyIdWithFilter(profile.id, "archived");
  const archivedCount = archivedPostings.length;

  const filteredPostings =
    validFilter === "archived"
      ? archivedPostings
      : validFilter
        ? allPostings.filter((p) => p.status === validFilter)
        : allPostings;

  // Per-status counts for tab badges
  const statusCounts: Record<string, number> = {};
  for (const posting of allPostings) {
    statusCounts[posting.status] = (statusCounts[posting.status] ?? 0) + 1;
  }

  return (
    <main id="main-content" className="container py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Link
          href={`/${locale}/jobs/new`}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          {t("createNew")}
        </Link>
      </div>

      {/* Status filter tabs */}
      <nav aria-label="Filter by status" className="mb-6 flex flex-wrap gap-2">
        <Link
          href={`/${locale}/my-jobs`}
          className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm transition-colors ${
            !validFilter
              ? "bg-primary text-primary-foreground"
              : "border border-input hover:bg-accent"
          }`}
          data-testid="filter-tab-all"
        >
          {lt("filterAll")}
          <span className="ml-1 rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
            {allPostings.length}
          </span>
        </Link>

        {FILTER_TABS.map((s) => (
          <Link
            key={s}
            href={`/${locale}/my-jobs?status=${s}`}
            className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm transition-colors ${
              validFilter === s
                ? "bg-primary text-primary-foreground"
                : "border border-input hover:bg-accent"
            }`}
            data-testid={`filter-tab-${s}`}
          >
            {pt(`status.${s}`)}
            {(statusCounts[s] ?? 0) > 0 && (
              <span className="ml-1 rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
                {statusCounts[s]}
              </span>
            )}
          </Link>
        ))}

        {/* Archived tab */}
        <Link
          href={`/${locale}/my-jobs?status=archived`}
          className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm transition-colors ${
            validFilter === "archived"
              ? "bg-primary text-primary-foreground"
              : "border border-input hover:bg-accent"
          }`}
          data-testid="filter-tab-archived"
        >
          {lt("filterArchived")}
          {archivedCount > 0 && (
            <span className="ml-1 rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
              {archivedCount}
            </span>
          )}
        </Link>
      </nav>

      {filteredPostings.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          {validFilter ? (
            <p className="text-lg font-medium">{lt("noPostingsForFilter")}</p>
          ) : (
            <>
              <p className="text-lg font-medium">{t("empty")}</p>
              <p className="mt-2 text-sm text-muted-foreground">{t("emptyDescription")}</p>
              <Link
                href={`/${locale}/jobs/new`}
                className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                {t("createFirst")}
              </Link>
            </>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {filteredPostings.map((posting) => (
            <li key={posting.id}>
              <JobPostingCard
                posting={posting}
                actions={
                  <PostingStatusActions
                    postingId={posting.id}
                    status={posting.status as PortalJobStatus}
                    locale={locale}
                    expiresAt={posting.expiresAt}
                  />
                }
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
