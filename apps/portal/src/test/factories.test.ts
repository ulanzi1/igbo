// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  companyProfileFactory,
  jobPostingFactory,
  applicationFactory,
  applicationTransitionFactory,
  adminReviewFactory,
  adminFlagFactory,
  postingReportFactory,
  employerVerificationFactory,
  screeningKeywordFactory,
  seekerProfileFactory,
  seekerPreferenceFactory,
  seekerCvFactory,
  applicationNoteFactory,
} from "./factories";

// ---------------------------------------------------------------------------
// Shape validation helpers
// ---------------------------------------------------------------------------

function expectUUID(val: unknown): void {
  expect(typeof val).toBe("string");
  expect(val as string).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
}

function expectDate(val: unknown): void {
  expect(val).toBeInstanceOf(Date);
}

// ---------------------------------------------------------------------------
// companyProfileFactory
// ---------------------------------------------------------------------------
describe("companyProfileFactory", () => {
  it("produces a valid PortalCompanyProfile shape", () => {
    const cp = companyProfileFactory();
    expectUUID(cp.id);
    expectUUID(cp.ownerUserId);
    expect(typeof cp.name).toBe("string");
    expect(cp.trustBadge).toBe(false);
    expect(cp.logoUrl).toBeNull();
    expect(cp.onboardingCompletedAt).toBeNull();
    expectDate(cp.createdAt);
    expectDate(cp.updatedAt);
  });

  it("generates unique IDs per call", () => {
    const a = companyProfileFactory();
    const b = companyProfileFactory();
    expect(a.id).not.toBe(b.id);
    expect(a.ownerUserId).not.toBe(b.ownerUserId);
  });

  it("applies overrides correctly", () => {
    const cp = companyProfileFactory({ name: "Acme Corp", trustBadge: true });
    expect(cp.name).toBe("Acme Corp");
    expect(cp.trustBadge).toBe(true);
  });

  it("override does not mutate defaults across calls", () => {
    companyProfileFactory({ name: "Override" });
    const fresh = companyProfileFactory();
    expect(fresh.name).toBe("Test Company");
  });
});

// ---------------------------------------------------------------------------
// jobPostingFactory
// ---------------------------------------------------------------------------
describe("jobPostingFactory", () => {
  it("produces a valid PortalJobPosting shape", () => {
    const jp = jobPostingFactory();
    expectUUID(jp.id);
    expectUUID(jp.companyId);
    expect(jp.employmentType).toBe("full_time");
    expect(jp.status).toBe("draft");
    expect(jp.revisionCount).toBe(0);
    expect(jp.viewCount).toBe(0);
    expect(jp.enableCoverLetter).toBe(false);
    expect(jp.screeningStatus).toBeNull();
    expectDate(jp.createdAt);
  });

  it("applies overrides correctly", () => {
    const jp = jobPostingFactory({ status: "active", revisionCount: 2 });
    expect(jp.status).toBe("active");
    expect(jp.revisionCount).toBe(2);
  });

  it("generates unique IDs per call", () => {
    expect(jobPostingFactory().id).not.toBe(jobPostingFactory().id);
  });
});

// ---------------------------------------------------------------------------
// applicationFactory
// ---------------------------------------------------------------------------
describe("applicationFactory", () => {
  it("produces a valid PortalApplication shape", () => {
    const app = applicationFactory();
    expectUUID(app.id);
    expectUUID(app.jobId);
    expectUUID(app.seekerUserId);
    expect(app.status).toBe("submitted");
    expect(app.previousStatus).toBeNull();
    expect(app.portfolioLinksJson).toEqual([]);
    expectDate(app.createdAt);
  });

  it("applies overrides correctly", () => {
    const id = crypto.randomUUID();
    const app = applicationFactory({ id, status: "shortlisted" });
    expect(app.id).toBe(id);
    expect(app.status).toBe("shortlisted");
  });
});

// ---------------------------------------------------------------------------
// applicationTransitionFactory
// ---------------------------------------------------------------------------
describe("applicationTransitionFactory", () => {
  it("produces a valid PortalApplicationTransition shape", () => {
    const t = applicationTransitionFactory();
    expectUUID(t.id);
    expectUUID(t.applicationId);
    expectUUID(t.actorUserId);
    expect(t.fromStatus).toBe("submitted");
    expect(t.toStatus).toBe("under_review");
    expect(t.actorRole).toBe("employer");
    expect(t.reason).toBeNull();
    expectDate(t.createdAt);
  });
});

// ---------------------------------------------------------------------------
// adminReviewFactory
// ---------------------------------------------------------------------------
describe("adminReviewFactory", () => {
  it("produces a valid PortalAdminReview shape", () => {
    const review = adminReviewFactory();
    expectUUID(review.id);
    expectUUID(review.postingId);
    expectUUID(review.reviewerUserId);
    expect(review.decision).toBe("approved");
    expect(review.feedbackComment).toBeNull();
    expectDate(review.reviewedAt);
    expectDate(review.createdAt);
  });

  it("applies overrides correctly", () => {
    const review = adminReviewFactory({ decision: "rejected", feedbackComment: "Not acceptable." });
    expect(review.decision).toBe("rejected");
    expect(review.feedbackComment).toBe("Not acceptable.");
  });
});

// ---------------------------------------------------------------------------
// adminFlagFactory
// ---------------------------------------------------------------------------
describe("adminFlagFactory", () => {
  it("produces a valid PortalAdminFlag shape", () => {
    const flag = adminFlagFactory();
    expectUUID(flag.id);
    expectUUID(flag.postingId);
    expectUUID(flag.adminUserId);
    expect(flag.category).toBe("other");
    expect(flag.severity).toBe("low");
    expect(flag.status).toBe("open");
    expect(flag.autoPaused).toBe(false);
    expect(flag.resolvedAt).toBeNull();
    expectDate(flag.createdAt);
  });

  it("applies overrides correctly", () => {
    const flag = adminFlagFactory({ severity: "high", autoPaused: true, status: "resolved" });
    expect(flag.severity).toBe("high");
    expect(flag.autoPaused).toBe(true);
    expect(flag.status).toBe("resolved");
  });
});

// ---------------------------------------------------------------------------
// postingReportFactory
// ---------------------------------------------------------------------------
describe("postingReportFactory", () => {
  it("produces a valid PortalPostingReport shape", () => {
    const report = postingReportFactory();
    expectUUID(report.id);
    expectUUID(report.postingId);
    expectUUID(report.reporterUserId);
    expect(report.category).toBe("scam_fraud");
    expect(report.status).toBe("open");
    expect(report.resolutionAction).toBeNull();
    expectDate(report.createdAt);
  });
});

// ---------------------------------------------------------------------------
// employerVerificationFactory
// ---------------------------------------------------------------------------
describe("employerVerificationFactory", () => {
  it("produces a valid PortalEmployerVerification shape", () => {
    const ver = employerVerificationFactory();
    expectUUID(ver.id);
    expectUUID(ver.companyId);
    expect(ver.status).toBe("pending");
    expect(ver.submittedDocuments).toEqual([]);
    expect(ver.adminNotes).toBeNull();
    expect(ver.reviewedAt).toBeNull();
    expectDate(ver.submittedAt);
    expectDate(ver.createdAt);
  });

  it("applies overrides correctly", () => {
    const docs = [{ fileUploadId: "fu-1", objectKey: "k/file.pdf", originalFilename: "reg.pdf" }];
    const ver = employerVerificationFactory({ status: "approved", submittedDocuments: docs });
    expect(ver.status).toBe("approved");
    expect(ver.submittedDocuments).toEqual(docs);
  });
});

// ---------------------------------------------------------------------------
// screeningKeywordFactory
// ---------------------------------------------------------------------------
describe("screeningKeywordFactory", () => {
  it("produces a valid PortalScreeningKeyword shape", () => {
    const kw = screeningKeywordFactory();
    expectUUID(kw.id);
    expect(typeof kw.phrase).toBe("string");
    expect(kw.category).toBe("discriminatory");
    expect(kw.severity).toBe("high");
    expect(kw.deletedAt).toBeNull();
    expectDate(kw.createdAt);
  });
});

// ---------------------------------------------------------------------------
// seekerProfileFactory
// ---------------------------------------------------------------------------
describe("seekerProfileFactory", () => {
  it("produces a valid PortalSeekerProfile shape", () => {
    const sp = seekerProfileFactory();
    expectUUID(sp.id);
    expectUUID(sp.userId);
    expect(sp.headline).toBe("Software Engineer");
    expect(sp.skills).toEqual([]);
    expect(sp.visibility).toBe("passive");
    expect(sp.consentMatching).toBe(false);
    expect(sp.profileViewCount).toBe(0);
    expect(sp.onboardingCompletedAt).toBeNull();
    expectDate(sp.createdAt);
  });

  it("applies overrides correctly", () => {
    const sp = seekerProfileFactory({ headline: "Product Manager", visibility: "active" });
    expect(sp.headline).toBe("Product Manager");
    expect(sp.visibility).toBe("active");
  });
});

// ---------------------------------------------------------------------------
// seekerPreferenceFactory
// ---------------------------------------------------------------------------
describe("seekerPreferenceFactory", () => {
  it("produces a valid PortalSeekerPreferences shape", () => {
    const pref = seekerPreferenceFactory();
    expectUUID(pref.id);
    expectUUID(pref.seekerProfileId);
    expect(pref.desiredRoles).toEqual([]);
    expect(pref.salaryCurrency).toBe("NGN");
    expect(pref.salaryMin).toBeNull();
    expectDate(pref.createdAt);
  });
});

// ---------------------------------------------------------------------------
// seekerCvFactory
// ---------------------------------------------------------------------------
describe("seekerCvFactory", () => {
  it("produces a valid PortalSeekerCv shape", () => {
    const cv = seekerCvFactory();
    expectUUID(cv.id);
    expectUUID(cv.seekerProfileId);
    expectUUID(cv.fileUploadId);
    expect(cv.label).toBe("My CV");
    expect(cv.isDefault).toBe(false);
    expectDate(cv.createdAt);
  });
});

// ---------------------------------------------------------------------------
// applicationNoteFactory
// ---------------------------------------------------------------------------
describe("applicationNoteFactory", () => {
  it("produces a valid PortalApplicationNote shape", () => {
    const note = applicationNoteFactory();
    expectUUID(note.id);
    expectUUID(note.applicationId);
    expectUUID(note.authorUserId);
    expect(typeof note.content).toBe("string");
    expect(note.content.length).toBeGreaterThan(0);
    expectDate(note.createdAt);
  });
});

// ---------------------------------------------------------------------------
// Cross-factory: unique IDs per call across all factories
// ---------------------------------------------------------------------------
describe("ID uniqueness across factories", () => {
  it("each factory call generates a unique id", () => {
    const ids = [
      companyProfileFactory().id,
      jobPostingFactory().id,
      applicationFactory().id,
      applicationTransitionFactory().id,
      adminReviewFactory().id,
      adminFlagFactory().id,
      postingReportFactory().id,
      employerVerificationFactory().id,
      screeningKeywordFactory().id,
      seekerProfileFactory().id,
      seekerPreferenceFactory().id,
      seekerCvFactory().id,
      applicationNoteFactory().id,
    ];
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});
