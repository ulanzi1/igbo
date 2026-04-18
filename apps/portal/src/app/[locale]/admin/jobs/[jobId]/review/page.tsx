import { Link } from "@/i18n/navigation";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { auth } from "@igbo/auth";
import { getTranslations, getFormatter } from "next-intl/server";
import { getReviewDetail } from "@/services/admin-review-service";
import { sanitizeHtml } from "@/lib/sanitize";
import { SalaryDisplay } from "@/components/semantic/salary-display";
import { ReviewActionPanel } from "@/components/domain/review-action-panel";
import { ScreeningResultsPanel } from "@/components/domain/screening-results-panel";
import { FlagHistoryPanel } from "@/components/domain/flag-history-panel";
import { FlagPostingTrigger } from "@/components/domain/flag-posting-trigger";

interface PageProps {
  params: Promise<{ locale: string; jobId: string }>;
}

export default async function ReviewDetailPage({ params }: PageProps) {
  const { locale, jobId } = await params;
  setRequestLocale(locale);

  const session = await auth();

  if (!session?.user || session.user.activePortalRole !== "JOB_ADMIN") {
    redirect(`/${locale}`);
  }

  const t = await getTranslations("Portal.admin");
  const tLanguage = await getTranslations("Portal.languageToggle");
  const format = await getFormatter();

  const detail = await getReviewDetail(jobId);

  if (!detail) {
    // redirect() throws NEXT_REDIRECT in prod (typed `never`), but we keep an
    // explicit return so unit tests that mock redirect() as a no-op don't
    // continue into the destructure below.
    redirect(`/${locale}/admin`);
    return null;
  }

  const {
    posting,
    company,
    employerName,
    totalPostings,
    approvedCount,
    rejectedCount,
    confidenceIndicator,
    screeningResult,
    reviewHistory,
    flags,
  } = detail;

  const formatDate = (d: Date) => format.dateTime(new Date(d), { dateStyle: "medium" });

  const approvalRate = totalPostings > 0 ? Math.round((approvedCount / totalPostings) * 100) : 0;

  const confidenceColorClass =
    confidenceIndicator.level === "high"
      ? "bg-green-500"
      : confidenceIndicator.level === "medium"
        ? "bg-amber-500"
        : "bg-red-500";

  const confidenceLabel =
    confidenceIndicator.level === "high"
      ? t("highConfidence")
      : confidenceIndicator.level === "medium"
        ? t("mediumConfidence")
        : t("lowConfidence");

  return (
    <main className="container mx-auto max-w-5xl px-4 py-8">
      {/* Back navigation */}
      <div className="mb-6">
        <Link
          href="/admin"
          className="text-sm text-muted-foreground hover:underline"
          data-testid="back-to-queue"
        >
          ← {t("backToQueue")}
        </Link>
      </div>

      <h1 className="mb-8 text-2xl font-bold" data-testid="review-detail-title">
        {t("reviewDetail")}: {posting.title}
      </h1>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column: Posting content */}
        <div className="space-y-6 lg:col-span-2">
          {/* Posting Content */}
          <section
            aria-label={t("postingContent")}
            className="rounded-lg border border-border bg-card p-6"
            data-testid="posting-content"
          >
            <h2 className="mb-4 text-lg font-semibold">{t("postingContent")}</h2>

            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
                  {posting.status}
                </span>
                {posting.employmentType && (
                  <span className="text-xs text-muted-foreground">{posting.employmentType}</span>
                )}
                {posting.location && (
                  <span className="text-xs text-muted-foreground">{posting.location}</span>
                )}
                {posting.descriptionIgboHtml && (
                  <span className="inline-flex items-center rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                    {tLanguage("bilingual")}
                  </span>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                {t("submitted")}: {formatDate(posting.createdAt)}
                {posting.revisionCount > 0 && (
                  <span className="ml-3">
                    {t("revisionCount")}: {posting.revisionCount}
                  </span>
                )}
              </p>

              {(posting.salaryMin != null ||
                posting.salaryMax != null ||
                posting.salaryCompetitiveOnly) && (
                <p className="text-sm" data-testid="salary">
                  <SalaryDisplay
                    min={posting.salaryMin}
                    max={posting.salaryMax}
                    competitiveOnly={posting.salaryCompetitiveOnly}
                  />
                </p>
              )}

              {posting.descriptionHtml && (
                <div
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(posting.descriptionHtml) }}
                  data-testid="description-html"
                />
              )}

              {posting.requirements && (
                <div data-testid="requirements">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    {t("requirementsLabel")}
                  </p>
                  <div
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(posting.requirements) }}
                  />
                </div>
              )}

              {posting.descriptionIgboHtml && (
                <details data-testid="igbo-description">
                  <summary className="cursor-pointer text-sm text-indigo-700">
                    {t("viewIgboDescription")}
                  </summary>
                  <div
                    className="prose prose-sm mt-2 max-w-none"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(posting.descriptionIgboHtml) }}
                  />
                </details>
              )}
            </div>
          </section>

          {/* Screening Results */}
          <section
            aria-label={t("screening")}
            className="rounded-lg border border-border bg-card p-6"
            data-testid="screening-section"
          >
            <h2 className="mb-4 text-lg font-semibold">{t("screening")}</h2>
            <ScreeningResultsPanel screeningResult={screeningResult} />
          </section>

          {/* Violation Flags */}
          <section
            aria-label={t("flagHistory")}
            className="rounded-lg border border-border bg-card p-6"
            data-testid="flag-history-section"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t("flagHistory")}</h2>
              <FlagPostingTrigger
                postingId={posting.id}
                postingTitle={posting.title}
                postingStatus={posting.status}
              />
            </div>
            <FlagHistoryPanel flags={flags} postingTitle={posting.title} />
          </section>

          {/* Review Action Panel — only shown when pending */}
          <ReviewActionPanel
            postingId={posting.id}
            postingStatus={posting.status}
            revisionCount={posting.revisionCount}
            locale={locale}
            previousFeedback={posting.adminFeedbackComment}
          />

          {/* Revision History — shown when there have been previous review decisions */}
          {reviewHistory.length > 0 && (
            <section
              aria-label={t("revisionHistory")}
              className="rounded-lg border border-border bg-card p-6"
              data-testid="revision-history"
            >
              <h2 className="mb-4 text-lg font-semibold">{t("revisionHistory")}</h2>
              <ol className="space-y-3">
                {reviewHistory.map((item) => (
                  <li key={item.id} className="border-l-2 border-muted pl-3">
                    <p className="text-xs text-muted-foreground">
                      {formatDate(item.reviewedAt)} — {item.decision}
                    </p>
                    {item.feedbackComment && <p className="mt-1 text-sm">{item.feedbackComment}</p>}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        {/* Right column: Employer Profile + Posting History */}
        <div className="space-y-6">
          {/* Employer Profile */}
          <section
            aria-label={t("employerProfile")}
            className="rounded-lg border border-border bg-card p-6"
            data-testid="employer-profile"
          >
            <h2 className="mb-4 text-lg font-semibold">{t("employerProfile")}</h2>

            <div className="space-y-2">
              <Link
                href={`/admin/postings?companyId=${company.id}`}
                className="font-medium text-primary hover:underline"
                aria-label={t("viewCompanyPostings", { company: company.name })}
                data-testid="company-name-link"
              >
                {company.name}
              </Link>

              {employerName && (
                <p className="text-sm text-muted-foreground" data-testid="employer-name">
                  {employerName}
                </p>
              )}

              {company.industry && (
                <p className="text-xs text-muted-foreground" data-testid="company-industry">
                  {company.industry}
                </p>
              )}

              {company.companySize && (
                <p className="text-xs text-muted-foreground" data-testid="company-size">
                  {company.companySize}
                </p>
              )}

              <div className="flex items-center gap-2 pt-1">
                <span
                  role="img"
                  aria-label={confidenceLabel}
                  className={`inline-block h-3 w-3 rounded-full ${confidenceColorClass}`}
                  data-testid="confidence-badge"
                />
                <span className="text-xs text-muted-foreground">{confidenceLabel}</span>
              </div>

              {company.trustBadge && (
                <p className="text-xs font-medium text-green-700" data-testid="trust-badge">
                  {t("verified")}
                </p>
              )}

              <div className="pt-1 text-xs text-muted-foreground" data-testid="trust-signals">
                <p>
                  {t("violations")}:{" "}
                  {confidenceIndicator.violationCount > 0 ? (
                    <Link
                      href={`/admin/violations?companyId=${company.id}`}
                      className="text-primary hover:underline"
                      aria-label={t("viewCompanyViolations", { company: company.name })}
                      data-testid="violations-count-link"
                    >
                      {confidenceIndicator.violationCount}
                    </Link>
                  ) : (
                    confidenceIndicator.violationCount
                  )}
                </p>
                <p>
                  {t("reports")}:{" "}
                  {confidenceIndicator.reportCount > 0 ? (
                    <Link
                      href="/admin/reports"
                      className="text-primary hover:underline"
                      aria-label={t("viewCompanyReports", { company: company.name })}
                      data-testid="reports-count-link"
                    >
                      {confidenceIndicator.reportCount}
                    </Link>
                  ) : (
                    confidenceIndicator.reportCount
                  )}
                </p>
                <p>
                  {t("engagement")}: {confidenceIndicator.engagementLevel}
                </p>
              </div>
            </div>
          </section>

          {/* Posting History */}
          <section
            aria-label={t("postingHistory")}
            className="rounded-lg border border-border bg-card p-6"
            data-testid="posting-history"
          >
            <h2 className="mb-4 text-lg font-semibold">{t("postingHistory")}</h2>

            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("totalPostings")}</dt>
                <dd className="font-medium" data-testid="total-postings">
                  {totalPostings}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("approvalRate")}</dt>
                <dd className="font-medium" data-testid="approval-rate">
                  {approvalRate}%
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("rejections")}</dt>
                <dd className="font-medium" data-testid="rejection-count">
                  {rejectedCount}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </main>
  );
}
