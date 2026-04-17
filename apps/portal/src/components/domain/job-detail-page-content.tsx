"use client";

import { useTranslations, useLocale } from "next-intl";
import { MapPinIcon, BriefcaseIcon, CalendarIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TrustBadge } from "@/components/domain/trust-badge";
import { ReportPostingButton } from "@/components/domain/report-posting-button";
import { ApplyButton } from "@/components/domain/apply-button";
import { ViewTracker } from "@/components/domain/view-tracker";
import { SalaryDisplay } from "@/components/semantic/salary-display";
import { CulturalContextBadges } from "@/components/semantic/cultural-context-badges";
import { formatDeadlineCountdown } from "@/lib/format-deadline-countdown";
import { formatPostingAge } from "@/lib/format-posting-age";
import { INDUSTRY_OPTIONS } from "@/lib/validations/company";
import { cn } from "@/lib/utils";

type KnownIndustry = (typeof INDUSTRY_OPTIONS)[number];

function isKnownIndustry(value: string): value is KnownIndustry {
  return (INDUSTRY_OPTIONS as readonly string[]).includes(value);
}

interface PostingProps {
  id: string;
  title: string;
  descriptionHtml: string | null;
  descriptionIgboHtml: string | null;
  requirements: string | null;
  location: string | null;
  employmentType: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCompetitiveOnly: boolean;
  applicationDeadline: string | null;
  culturalContextJson: Record<string, boolean> | null;
  enableCoverLetter: boolean;
  createdAt: string;
}

interface CompanyProps {
  id: string;
  name: string;
  logoUrl: string | null;
  description: string | null;
  industry: string | null;
  companySize: string | null;
  cultureInfo: string | null;
  trustBadge: boolean;
}

interface SeekerProfileProps {
  headline: string | null;
  skills: string[];
}

export interface JobDetailPageContentProps {
  jobId: string;
  locale: string;
  posting: PostingProps;
  company: CompanyProps;
  isGuest: boolean;
  isSeeker: boolean;
  isEmployerOrAdmin: boolean;
  canReport: boolean;
  isExpiredOrFilled: boolean;
  isFilled: boolean;
  seekerProfile: SeekerProfileProps | null;
  hasExistingApplication: boolean;
  applicationDate: string | null;
  profileLocation: string | null;
  deadlinePassed: boolean;
  employmentTypeLabel: string;
  remoteLabel: string;
  communityUrl: string;
}

export function JobDetailPageContent({
  jobId,
  locale,
  posting,
  company,
  isGuest,
  isSeeker,
  isEmployerOrAdmin,
  canReport,
  isExpiredOrFilled,
  isFilled,
  seekerProfile,
  hasExistingApplication,
  applicationDate,
  profileLocation,
  deadlinePassed,
  employmentTypeLabel,
  remoteLabel,
  communityUrl,
}: JobDetailPageContentProps) {
  const t = useTranslations("Portal.jobDetail");
  const tSearch = useTranslations("Portal.search");
  const tIndustries = useTranslations("Portal.industries");
  const currentLocale = useLocale();

  const resolvedLocale = locale || currentLocale;

  const deadline = formatDeadlineCountdown(posting.applicationDeadline, resolvedLocale);
  const postingAge = formatPostingAge(posting.createdAt, resolvedLocale);

  const industryLabel =
    company.industry && isKnownIndustry(company.industry)
      ? tIndustries(company.industry)
      : company.industry;

  const showCtaBar = !isExpiredOrFilled && !isEmployerOrAdmin;

  // Sign-in URL for guests: community login with returnTo
  // communityUrl is passed from the server component so SSR renders correctly.
  // On the client, append the current page URL as callbackUrl.
  const signInUrl =
    typeof window !== "undefined"
      ? `${communityUrl}/auth/signin?callbackUrl=${encodeURIComponent(window.location.href)}`
      : `${communityUrl}/auth/signin`;

  return (
    <>
      <ViewTracker jobId={jobId} />

      {/* Main grid: content left, sticky CTA sidebar on desktop */}
      <div className="container mx-auto max-w-5xl px-4 py-8 pb-24 md:pb-8">
        {/* Back link */}
        <a
          href={`/${resolvedLocale}/jobs`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          ← {t("backToJobs")}
        </a>

        {/* Status banners */}
        {isExpiredOrFilled && (
          <div
            role="alert"
            aria-live="polite"
            className={cn(
              "mb-6 rounded-lg border px-4 py-3 text-sm font-medium",
              isFilled
                ? "border-blue-200 bg-blue-50 text-blue-800"
                : "border-amber-200 bg-amber-50 text-amber-800",
            )}
          >
            {isFilled ? (
              <>
                {t("filledBanner")}{" "}
                <a href={`/${resolvedLocale}/jobs`} className="underline underline-offset-2">
                  {t("filledBrowseLink")}
                </a>
              </>
            ) : (
              <>
                {t("expiredBanner")}{" "}
                <a
                  href={`/${resolvedLocale}/search?q=${encodeURIComponent(posting.title)}`}
                  className="underline underline-offset-2"
                >
                  {t("expiredSearchLink")}
                </a>
              </>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-8">
          {/* Main content column */}
          <div>
            {/* Header: logo + title + company */}
            <div className="mb-6">
              <div className="flex items-start gap-4">
                {/* Company logo / avatar */}
                <Avatar size="lg" className="rounded-md">
                  <AvatarImage src={company.logoUrl ?? undefined} alt={`${company.name} logo`} />
                  <AvatarFallback className="rounded-md text-base">
                    {company.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h1 className="text-2xl font-bold text-foreground leading-tight">
                        {posting.title}
                      </h1>
                      <div className="flex items-center gap-2 mt-1">
                        <a
                          href={`/${resolvedLocale}/companies/${company.id}`}
                          className="text-base font-medium text-muted-foreground hover:text-foreground hover:underline"
                        >
                          {company.name}
                        </a>
                        {company.trustBadge && <TrustBadge />}
                      </div>
                    </div>
                    {canReport && (
                      <ReportPostingButton postingId={posting.id} postingTitle={posting.title} />
                    )}
                  </div>
                </div>
              </div>

              {/* Meta section */}
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <MapPinIcon className="size-3.5 shrink-0" aria-hidden="true" />
                  {posting.location ?? remoteLabel}
                </span>
                <span className="flex items-center gap-1">
                  <BriefcaseIcon className="size-3.5 shrink-0" aria-hidden="true" />
                  <Badge variant="secondary" className="text-xs font-normal">
                    {employmentTypeLabel}
                  </Badge>
                </span>
                {(posting.salaryMin != null ||
                  posting.salaryMax != null ||
                  posting.salaryCompetitiveOnly) && (
                  <span>
                    <SalaryDisplay
                      min={posting.salaryMin}
                      max={posting.salaryMax}
                      competitiveOnly={posting.salaryCompetitiveOnly}
                    />
                  </span>
                )}
              </div>

              {/* Posting age + deadline */}
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {postingAge.variant === "relative" ? (
                  <span>{tSearch("card.postingAgeRelative", { days: postingAge.days })}</span>
                ) : (
                  <span>{tSearch("card.postingAgeAbsolute", { date: postingAge.date })}</span>
                )}
                {deadline && (
                  <span
                    className={cn(
                      "flex items-center gap-1",
                      deadline.severity === "critical" && "text-red-600 font-medium",
                      deadline.severity === "warning" && "text-amber-600 font-medium",
                    )}
                  >
                    <CalendarIcon className="size-3 shrink-0" aria-hidden="true" />
                    {deadline.variant === "today" && tSearch("card.deadlineToday")}
                    {deadline.variant === "inDays" &&
                      tSearch("card.deadlineInDays", { days: deadline.days ?? 0 })}
                    {deadline.variant === "absolute" &&
                      tSearch("card.deadlineAbsolute", { date: deadline.date ?? "" })}
                  </span>
                )}
              </div>

              {/* Cultural context badges */}
              {posting.culturalContextJson && (
                <CulturalContextBadges culturalContext={posting.culturalContextJson} />
              )}

              {/* Applied-on date for seekers who've already applied */}
              {isSeeker && hasExistingApplication && applicationDate && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("appliedOn", {
                    date: new Intl.DateTimeFormat(resolvedLocale, { dateStyle: "medium" }).format(
                      new Date(applicationDate),
                    ),
                  })}
                </p>
              )}
            </div>

            {/* Tabs: Description / Company Info / Similar Jobs */}
            <Tabs defaultValue="description">
              <TabsList className="mb-6">
                <TabsTrigger value="description">{t("descriptionTab")}</TabsTrigger>
                <TabsTrigger value="company">{t("companyInfoTab")}</TabsTrigger>
                <TabsTrigger value="similar">{t("similarJobsTab")}</TabsTrigger>
              </TabsList>

              {/* Description tab */}
              <TabsContent value="description">
                {(posting.descriptionHtml || posting.descriptionIgboHtml) && (
                  <section aria-labelledby="description-heading" className="mb-6">
                    <h2
                      id="description-heading"
                      className="mb-3 text-lg font-semibold text-foreground"
                    >
                      {t("descriptionTab")}
                    </h2>
                    {/* ci-allow-unsanitized-html — sanitized server-side in page.tsx */}
                    <div
                      className="prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{
                        __html:
                          resolvedLocale === "ig" && posting.descriptionIgboHtml
                            ? posting.descriptionIgboHtml
                            : (posting.descriptionHtml ?? ""),
                      }}
                    />
                  </section>
                )}
                {posting.requirements && (
                  <section aria-labelledby="requirements-heading">
                    <h2
                      id="requirements-heading"
                      className="mb-3 text-lg font-semibold text-foreground"
                    >
                      {t("requirements")}
                    </h2>
                    {/* ci-allow-unsanitized-html — sanitized server-side in page.tsx */}
                    <div
                      className="prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{
                        __html: posting.requirements,
                      }}
                    />
                  </section>
                )}
              </TabsContent>

              {/* Company Info tab */}
              <TabsContent value="company">
                <section aria-labelledby="company-heading">
                  <h2 id="company-heading" className="mb-4 text-lg font-semibold text-foreground">
                    {t("aboutCompany", { company: company.name })}
                  </h2>
                  {company.description && (
                    <p className="mb-4 text-sm text-muted-foreground">{company.description}</p>
                  )}
                  <dl className="space-y-3">
                    {industryLabel && (
                      <div>
                        <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          {t("companyIndustry")}
                        </dt>
                        <dd className="mt-1 text-sm">{industryLabel}</dd>
                      </div>
                    )}
                    {company.companySize && (
                      <div>
                        <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          {t("companySize")}
                        </dt>
                        <dd className="mt-1 text-sm">{company.companySize}</dd>
                      </div>
                    )}
                    {company.cultureInfo && (
                      <div>
                        <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          {t("companyCulture")}
                        </dt>
                        {/* ci-allow-unsanitized-html — sanitized server-side in page.tsx */}
                        <dd
                          className="mt-1 prose prose-sm max-w-none"
                          dangerouslySetInnerHTML={{
                            __html: company.cultureInfo,
                          }}
                        />
                      </div>
                    )}
                  </dl>
                </section>
              </TabsContent>

              {/* Similar Jobs tab (placeholder) */}
              <TabsContent value="similar">
                <p className="text-sm text-muted-foreground">{t("similarJobsPlaceholder")}</p>
              </TabsContent>
            </Tabs>
          </div>

          {/* Desktop sticky CTA sidebar */}
          {showCtaBar && (
            <div className="hidden md:block">
              <div className="sticky top-4">
                <CtaCard
                  isGuest={isGuest}
                  isSeeker={isSeeker}
                  signInUrl={signInUrl}
                  jobId={jobId}
                  posting={posting}
                  company={company}
                  seekerProfile={seekerProfile}
                  hasExistingApplication={hasExistingApplication}
                  applicationDate={applicationDate}
                  profileLocation={profileLocation}
                  deadlinePassed={deadlinePassed}
                  locale={resolvedLocale}
                  t={t}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile fixed bottom CTA bar */}
      {showCtaBar && (
        <div className="fixed bottom-0 inset-x-0 z-50 border-t bg-background p-4 md:hidden">
          <CtaContent
            isGuest={isGuest}
            isSeeker={isSeeker}
            signInUrl={signInUrl}
            jobId={jobId}
            posting={posting}
            company={company}
            seekerProfile={seekerProfile}
            hasExistingApplication={hasExistingApplication}
            applicationDate={applicationDate}
            profileLocation={profileLocation}
            deadlinePassed={deadlinePassed}
            locale={resolvedLocale}
            t={t}
          />
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Internal CTA sub-components
// ---------------------------------------------------------------------------

interface CtaProps {
  isGuest: boolean;
  isSeeker: boolean;
  signInUrl: string;
  jobId: string;
  posting: PostingProps;
  company: CompanyProps;
  seekerProfile: SeekerProfileProps | null;
  hasExistingApplication: boolean;
  applicationDate: string | null;
  profileLocation: string | null;
  deadlinePassed: boolean;
  locale: string;
  t: ReturnType<typeof useTranslations<"Portal.jobDetail">>;
}

function CtaCard(props: CtaProps) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <CtaContent {...props} />
    </div>
  );
}

function CtaContent({
  isGuest,
  isSeeker,
  signInUrl,
  jobId,
  posting,
  company,
  seekerProfile,
  hasExistingApplication,
  applicationDate,
  profileLocation,
  deadlinePassed,
  locale,
  t,
}: CtaProps) {
  if (isGuest) {
    return (
      <a
        href={signInUrl}
        className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t("signInToApply")}
      </a>
    );
  }

  if (isSeeker) {
    return (
      <div className="flex flex-col gap-2">
        {hasExistingApplication && applicationDate && (
          <p className="text-xs text-muted-foreground text-center">
            {t("appliedOn", {
              date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
                new Date(applicationDate),
              ),
            })}
          </p>
        )}
        <ApplyButton
          jobId={jobId}
          jobTitle={posting.title}
          companyName={company.name}
          hasProfile={seekerProfile !== null}
          hasExistingApplication={hasExistingApplication}
          deadlinePassed={deadlinePassed}
          enableCoverLetter={posting.enableCoverLetter}
          profileHeadline={seekerProfile?.headline ?? null}
          profileSkills={seekerProfile?.skills ?? []}
          profileLocation={profileLocation}
          locale={locale}
        />
      </div>
    );
  }

  return null;
}
