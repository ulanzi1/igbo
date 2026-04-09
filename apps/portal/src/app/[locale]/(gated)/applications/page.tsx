import { getTranslations } from "next-intl/server";
import { auth } from "@igbo/auth";
import { redirect } from "next/navigation";
import { getApplicationsWithJobDataBySeekerId } from "@igbo/db/queries/portal-applications";
import { ApplicationStatusBadge } from "@/components/domain/application-status-badge";
import { Link } from "@/i18n/navigation";
import type { PortalApplicationStatus } from "@igbo/db/schema/portal-applications";

type ApplicationFilter = "active" | "withdrawn" | "rejected" | "hired";

const ACTIVE_STATUSES: PortalApplicationStatus[] = [
  "submitted",
  "under_review",
  "shortlisted",
  "interview",
  "offered",
];

const FILTER_STATUS_MAP: Record<ApplicationFilter, PortalApplicationStatus[]> = {
  active: ACTIVE_STATUSES,
  withdrawn: ["withdrawn"],
  rejected: ["rejected"],
  hired: ["hired"],
};

const VALID_FILTERS: ApplicationFilter[] = ["active", "withdrawn", "rejected", "hired"];

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
}

export default async function ApplicationsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { status: rawStatus } = await searchParams;
  const t = await getTranslations("Portal.applications");

  const session = await auth();
  if (!session?.user || session.user.activePortalRole !== "JOB_SEEKER") {
    redirect(`/${locale}`);
  }

  const activeFilter = VALID_FILTERS.includes(rawStatus as ApplicationFilter)
    ? (rawStatus as ApplicationFilter)
    : undefined;

  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const allApplications = await getApplicationsWithJobDataBySeekerId(session.user.id);

  // Per-filter counts for tab badges
  const filterCounts: Record<string, number> = {};
  for (const filter of VALID_FILTERS) {
    const statuses = FILTER_STATUS_MAP[filter];
    filterCounts[filter] = allApplications.filter((a) => statuses.includes(a.status)).length;
  }

  const filteredApplications = activeFilter
    ? allApplications.filter((a) => FILTER_STATUS_MAP[activeFilter].includes(a.status))
    : allApplications;

  const filterLabels: Record<ApplicationFilter, string> = {
    active: t("filterActive"),
    withdrawn: t("filterWithdrawn"),
    rejected: t("filterRejected"),
    hired: t("filterHired"),
  };

  return (
    <div className="py-8">
      <h1 className="mb-6 text-2xl font-bold">{t("title")}</h1>

      {/* Status filter tabs */}
      <nav aria-label={t("filterAriaLabel")} className="mb-6 flex flex-wrap gap-2">
        <Link
          href="/applications"
          className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm transition-colors ${
            !activeFilter
              ? "bg-primary text-primary-foreground"
              : "border border-input hover:bg-accent"
          }`}
          aria-current={!activeFilter ? "page" : undefined}
          data-testid="filter-tab-all"
        >
          {t("filterAll")}
          {allApplications.length > 0 && (
            <span className="ml-1 rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
              {allApplications.length}
            </span>
          )}
        </Link>

        {VALID_FILTERS.map((filter) => (
          <Link
            key={filter}
            href={`/applications?status=${filter}`}
            className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm transition-colors ${
              activeFilter === filter
                ? "bg-primary text-primary-foreground"
                : "border border-input hover:bg-accent"
            }`}
            aria-current={activeFilter === filter ? "page" : undefined}
            data-testid={`filter-tab-${filter}`}
          >
            {filterLabels[filter]}
            {(filterCounts[filter] ?? 0) > 0 && (
              <span className="ml-1 rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
                {filterCounts[filter]}
              </span>
            )}
          </Link>
        ))}
      </nav>

      {allApplications.length === 0 ? (
        /* Global empty state */
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-lg font-medium">{t("emptyTitle")}</p>
          <p className="mt-2 text-sm text-muted-foreground">{t("emptyDescription")}</p>
          <Link
            href="/jobs"
            className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            {t("emptyCta")}
          </Link>
        </div>
      ) : filteredApplications.length === 0 ? (
        /* Filter empty state */
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-lg font-medium">
            {t("filterEmpty", { filter: activeFilter ? filterLabels[activeFilter] : "" })}
          </p>
        </div>
      ) : (
        <ul role="list" className="space-y-3">
          {filteredApplications.map((application) => (
            <li key={application.id}>
              <Link
                href={`/applications/${application.id}`}
                className="block rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {application.jobTitle ?? "—"}
                    </p>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {application.companyName ?? "—"}
                    </p>
                  </div>
                  <ApplicationStatusBadge status={application.status} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{t("appliedOn", { date: dateFormat.format(application.createdAt) })}</span>
                  <span>
                    {t("lastUpdated", { date: dateFormat.format(application.updatedAt) })}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
