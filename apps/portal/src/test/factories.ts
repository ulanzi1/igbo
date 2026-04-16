/**
 * Test factory functions for portal entities.
 *
 * Pure functions — no side effects, no DB writes, no server-only imports.
 * Each factory returns a plain object matching the Drizzle $inferSelect type
 * for the corresponding table. Pass `overrides` to set test-specific fields.
 *
 * Usage:
 *   import { companyProfileFactory, jobPostingFactory } from "@/test/factories";
 *   const company = companyProfileFactory({ name: "Acme Corp" });
 *   const posting = jobPostingFactory({ companyId: company.id, status: "active" });
 */
import type { PortalCompanyProfile } from "@igbo/db/schema/portal-company-profiles";
import type { PortalJobPosting } from "@igbo/db/schema/portal-job-postings";
import type {
  PortalApplication,
  PortalApplicationTransition,
} from "@igbo/db/schema/portal-applications";
import type { PortalAdminReview } from "@igbo/db/schema/portal-admin-reviews";
import type { PortalAdminFlag } from "@igbo/db/schema/portal-admin-flags";
import type { PortalPostingReport } from "@igbo/db/schema/portal-posting-reports";
import type { PortalEmployerVerification } from "@igbo/db/schema/portal-employer-verifications";
import type { PortalScreeningKeyword } from "@igbo/db/schema/portal-screening-keywords";
import type { PortalSeekerProfile } from "@igbo/db/schema/portal-seeker-profiles";
import type { PortalSeekerPreferences } from "@igbo/db/schema/portal-seeker-preferences";
import type { PortalSeekerCv } from "@igbo/db/schema/portal-seeker-cvs";
import type { PortalApplicationNote } from "@igbo/db/schema/portal-application-notes";

const FIXED_DATE = new Date("2026-01-01T00:00:00.000Z");

// ---------------------------------------------------------------------------
// Company Profiles
// ---------------------------------------------------------------------------

export function companyProfileFactory(
  overrides?: Partial<PortalCompanyProfile>,
): PortalCompanyProfile {
  return {
    id: crypto.randomUUID(),
    ownerUserId: crypto.randomUUID(),
    name: "Test Company",
    logoUrl: null,
    description: null,
    industry: null,
    companySize: null,
    cultureInfo: null,
    trustBadge: false,
    onboardingCompletedAt: null,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Job Postings
// ---------------------------------------------------------------------------

export function jobPostingFactory(overrides?: Partial<PortalJobPosting>): PortalJobPosting {
  return {
    id: crypto.randomUUID(),
    companyId: crypto.randomUUID(),
    title: "Software Engineer",
    descriptionHtml: "<p>A great opportunity to join our team.</p>",
    requirements: null,
    salaryMin: null,
    salaryMax: null,
    salaryCompetitiveOnly: false,
    location: "Lagos, Nigeria",
    employmentType: "full_time",
    status: "draft",
    culturalContextJson: null,
    descriptionIgboHtml: null,
    applicationDeadline: null,
    expiresAt: null,
    adminFeedbackComment: null,
    closedOutcome: null,
    closedAt: null,
    archivedAt: null,
    revisionCount: 0,
    viewCount: 0,
    communityPostId: null,
    screeningStatus: null,
    screeningResultJson: null,
    screeningCheckedAt: null,
    enableCoverLetter: false,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

export function applicationFactory(overrides?: Partial<PortalApplication>): PortalApplication {
  return {
    id: crypto.randomUUID(),
    jobId: crypto.randomUUID(),
    seekerUserId: crypto.randomUUID(),
    status: "submitted",
    previousStatus: null,
    transitionedAt: null,
    transitionedByUserId: null,
    transitionReason: null,
    selectedCvId: null,
    coverLetterText: null,
    portfolioLinksJson: [],
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
    ...overrides,
  };
}

export function applicationTransitionFactory(
  overrides?: Partial<PortalApplicationTransition>,
): PortalApplicationTransition {
  return {
    id: crypto.randomUUID(),
    applicationId: crypto.randomUUID(),
    fromStatus: "submitted",
    toStatus: "under_review",
    actorUserId: crypto.randomUUID(),
    actorRole: "employer",
    reason: null,
    createdAt: FIXED_DATE,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Admin Reviews
// ---------------------------------------------------------------------------

export function adminReviewFactory(overrides?: Partial<PortalAdminReview>): PortalAdminReview {
  return {
    id: crypto.randomUUID(),
    postingId: crypto.randomUUID(),
    reviewerUserId: crypto.randomUUID(),
    decision: "approved",
    feedbackComment: null,
    reviewedAt: FIXED_DATE,
    createdAt: FIXED_DATE,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Admin Flags
// ---------------------------------------------------------------------------

export function adminFlagFactory(overrides?: Partial<PortalAdminFlag>): PortalAdminFlag {
  return {
    id: crypto.randomUUID(),
    postingId: crypto.randomUUID(),
    adminUserId: crypto.randomUUID(),
    category: "other",
    severity: "low",
    description: "This posting contains a policy violation.",
    status: "open",
    autoPaused: false,
    resolvedAt: null,
    resolvedByUserId: null,
    resolutionAction: null,
    resolutionNote: null,
    createdAt: FIXED_DATE,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Posting Reports
// ---------------------------------------------------------------------------

export function postingReportFactory(
  overrides?: Partial<PortalPostingReport>,
): PortalPostingReport {
  return {
    id: crypto.randomUUID(),
    postingId: crypto.randomUUID(),
    reporterUserId: crypto.randomUUID(),
    category: "scam_fraud",
    description: "This looks like a scam.",
    status: "open",
    resolutionAction: null,
    resolvedAt: null,
    resolvedByUserId: null,
    resolutionNote: null,
    createdAt: FIXED_DATE,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Employer Verifications
// ---------------------------------------------------------------------------

export function employerVerificationFactory(
  overrides?: Partial<PortalEmployerVerification>,
): PortalEmployerVerification {
  return {
    id: crypto.randomUUID(),
    companyId: crypto.randomUUID(),
    submittedDocuments: [],
    status: "pending",
    adminNotes: null,
    submittedAt: FIXED_DATE,
    reviewedAt: null,
    reviewedByAdminId: null,
    createdAt: FIXED_DATE,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Screening Keywords
// ---------------------------------------------------------------------------

export function screeningKeywordFactory(
  overrides?: Partial<PortalScreeningKeyword>,
): PortalScreeningKeyword {
  return {
    id: crypto.randomUUID(),
    phrase: "must be male",
    category: "discriminatory",
    severity: "high",
    notes: null,
    createdByAdminId: null,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
    deletedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Seeker Profiles
// ---------------------------------------------------------------------------

export function seekerProfileFactory(
  overrides?: Partial<PortalSeekerProfile>,
): PortalSeekerProfile {
  return {
    id: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    headline: "Software Engineer",
    summary: null,
    skills: [],
    experienceJson: [] as unknown,
    educationJson: [] as unknown,
    visibility: "passive",
    consentMatching: false,
    consentEmployerView: false,
    consentMatchingChangedAt: null,
    consentEmployerViewChangedAt: null,
    profileViewCount: 0,
    onboardingCompletedAt: null,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Seeker Preferences
// ---------------------------------------------------------------------------

export function seekerPreferenceFactory(
  overrides?: Partial<PortalSeekerPreferences>,
): PortalSeekerPreferences {
  return {
    id: crypto.randomUUID(),
    seekerProfileId: crypto.randomUUID(),
    desiredRoles: [],
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: "NGN",
    locations: [],
    workModes: [],
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Seeker CVs
// ---------------------------------------------------------------------------

export function seekerCvFactory(overrides?: Partial<PortalSeekerCv>): PortalSeekerCv {
  return {
    id: crypto.randomUUID(),
    seekerProfileId: crypto.randomUUID(),
    fileUploadId: crypto.randomUUID(),
    label: "My CV",
    isDefault: false,
    createdAt: FIXED_DATE,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Application Notes
// ---------------------------------------------------------------------------

export function applicationNoteFactory(
  overrides?: Partial<PortalApplicationNote>,
): PortalApplicationNote {
  return {
    id: crypto.randomUUID(),
    applicationId: crypto.randomUUID(),
    authorUserId: crypto.randomUUID(),
    content: "This candidate looks very promising for the role.",
    createdAt: FIXED_DATE,
    ...overrides,
  };
}
