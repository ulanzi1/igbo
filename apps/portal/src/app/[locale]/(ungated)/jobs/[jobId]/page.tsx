import { cache } from "react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { auth } from "@igbo/auth";
import { getJobPostingWithCompany } from "@igbo/db/queries/portal-job-postings";
import { getSeekerProfileByUserId } from "@igbo/db/queries/portal-seeker-profiles";
import { getExistingActiveApplication } from "@igbo/db/queries/portal-applications";
import { findUserById } from "@igbo/db/queries/auth-queries";
import type { Metadata } from "next";
import { sanitizeHtml } from "@/lib/sanitize";
import { JobDetailPageContent } from "@/components/domain/job-detail-page-content";
import {
  buildJobOpenGraph,
  buildJobTwitterCard,
  buildJobPostingJsonLd,
  extractPlainTexts,
} from "@/lib/seo";

// React cache() deduplicates within a single request — avoids double DB hit
// when both generateMetadata() and the page component call this.
const getCachedJobPostingWithCompany = cache(getJobPostingWithCompany);

interface PageProps {
  params: Promise<{ locale: string; jobId: string }>;
}

// Statuses that should return 404 (not public)
const NOT_FOUND_STATUSES = ["draft", "pending_review", "paused", "rejected"] as const;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, jobId } = await params;
  const result = await getCachedJobPostingWithCompany(jobId);
  if (!result) return {};
  const { posting, company } = result;

  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  const title = `${posting.title} at ${company.name} | OBIGBO Job Portal`;
  const { short: shortDescription } = extractPlainTexts(posting.descriptionHtml);
  const canonicalUrl = `${portalUrl}/en/jobs/${jobId}`;

  // Status check for noindex — expired/filled pages should not be indexed
  const now = new Date();
  const isExpiredOrFilled =
    posting.status === "expired" ||
    posting.status === "filled" ||
    (posting.status === "active" && posting.expiresAt !== null && posting.expiresAt < now);

  return {
    title,
    description: shortDescription,
    alternates: { canonical: canonicalUrl },
    openGraph: buildJobOpenGraph(posting, company, portalUrl, locale, shortDescription),
    twitter: buildJobTwitterCard(posting, company, portalUrl, shortDescription),
    ...(isExpiredOrFilled ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function JobDetailPage({ params }: PageProps) {
  const { locale, jobId } = await params;

  // Batch 1 (parallel): translations + job data + session — all independent
  const [jt, pt, result, session] = await Promise.all([
    getTranslations("Portal.jobDetail"),
    getTranslations("Portal.posting"),
    getCachedJobPostingWithCompany(jobId),
    auth(),
  ]);

  // Not found → 404
  if (!result) {
    notFound();
  }

  const { posting, company } = result;

  // Non-public statuses → 404
  if ((NOT_FOUND_STATUSES as readonly string[]).includes(posting.status)) {
    notFound();
  }

  // Determine if expired or filled (show banner but NOT 404)
  const now = new Date();
  const isExpiredByStatus = posting.status === "expired" || posting.status === "filled";
  const isExpiredByDate =
    posting.status === "active" && posting.expiresAt !== null && posting.expiresAt < now;
  const isExpiredOrFilled = isExpiredByStatus || isExpiredByDate;
  const isFilled = posting.status === "filled";

  // Date-only deadline comparison: deadline day itself is still open
  const deadlinePassed =
    posting.applicationDeadline !== null &&
    posting.applicationDeadline.toISOString().slice(0, 10) < now.toISOString().slice(0, 10);

  const isSeeker = session?.user?.activePortalRole === "JOB_SEEKER";
  const isGuest = !session?.user;
  const isEmployerOrAdmin =
    session?.user?.activePortalRole === "EMPLOYER" ||
    session?.user?.activePortalRole === "JOB_ADMIN";
  const canReport =
    session?.user?.activePortalRole === "JOB_SEEKER" ||
    session?.user?.activePortalRole === "EMPLOYER";

  let seekerProfile = null;
  let hasExistingApplication = false;
  let applicationDate: string | null = null;
  let profileLocation: string | null = null;

  // Batch 2 (conditional): seeker-specific data
  if (isSeeker && session?.user?.id) {
    const userId = session.user.id;
    const [profile, existing, authUser] = await Promise.all([
      getSeekerProfileByUserId(userId),
      getExistingActiveApplication(jobId, userId),
      findUserById(userId),
    ]);

    seekerProfile = profile;
    if (seekerProfile) {
      if (existing !== null) {
        hasExistingApplication = true;
        applicationDate = existing.createdAt.toISOString();
      }
      if (authUser) {
        const parts = [
          authUser.locationCity,
          authUser.locationState,
          authUser.locationCountry,
        ].filter(Boolean);
        profileLocation = parts.length > 0 ? parts.join(", ") : null;
      }
    }
  }

  // i18n strings for the client component
  const employmentTypeLabel = (() => {
    try {
      return pt(`type.${posting.employmentType}`);
    } catch {
      return posting.employmentType;
    }
  })();

  const remoteLabel = jt("remote");
  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";

  return (
    <>
      <JobDetailPageContent
        jobId={jobId}
        locale={locale}
        posting={{
          id: posting.id,
          title: posting.title,
          descriptionHtml: posting.descriptionHtml ? sanitizeHtml(posting.descriptionHtml) : null,
          descriptionIgboHtml: posting.descriptionIgboHtml
            ? sanitizeHtml(posting.descriptionIgboHtml)
            : null,
          requirements: posting.requirements ? sanitizeHtml(posting.requirements) : null,
          location: posting.location,
          employmentType: posting.employmentType,
          salaryMin: posting.salaryMin,
          salaryMax: posting.salaryMax,
          salaryCompetitiveOnly: posting.salaryCompetitiveOnly,
          applicationDeadline: posting.applicationDeadline?.toISOString() ?? null,
          culturalContextJson: posting.culturalContextJson as Record<string, boolean> | null,
          enableCoverLetter: posting.enableCoverLetter,
          createdAt: posting.createdAt.toISOString(),
        }}
        company={{
          id: company.id,
          name: company.name,
          logoUrl: company.logoUrl,
          description: company.description,
          industry: company.industry,
          companySize: company.companySize,
          cultureInfo: company.cultureInfo ? sanitizeHtml(company.cultureInfo) : null,
          trustBadge: company.trustBadge,
        }}
        isGuest={isGuest}
        isSeeker={isSeeker}
        isEmployerOrAdmin={isEmployerOrAdmin}
        canReport={canReport}
        isExpiredOrFilled={isExpiredOrFilled}
        isFilled={isFilled}
        seekerProfile={
          seekerProfile
            ? {
                headline: seekerProfile.headline ?? null,
                skills: seekerProfile.skills ?? [],
              }
            : null
        }
        hasExistingApplication={hasExistingApplication}
        applicationDate={applicationDate}
        profileLocation={profileLocation}
        deadlinePassed={deadlinePassed}
        employmentTypeLabel={employmentTypeLabel}
        remoteLabel={remoteLabel}
        communityUrl={process.env.NEXT_PUBLIC_COMMUNITY_URL ?? ""}
      />
      {!isExpiredOrFilled && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(
              buildJobPostingJsonLd(
                posting,
                company,
                portalUrl,
                extractPlainTexts(posting.descriptionHtml).full,
              ),
            ).replace(/</g, "\\u003c"),
          }}
        />
      )}
    </>
  );
}
