// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  portalAdminReviews,
  type PortalAdminReview,
  type NewPortalAdminReview,
  type AdminReviewDecision,
} from "./portal-admin-reviews";

describe("portalAdminReviews schema", () => {
  it("has all required columns", () => {
    const cols = Object.keys(portalAdminReviews);
    expect(cols).toContain("id");
    expect(cols).toContain("postingId");
    expect(cols).toContain("reviewerUserId");
    expect(cols).toContain("decision");
    expect(cols).toContain("feedbackComment");
    expect(cols).toContain("reviewedAt");
    expect(cols).toContain("createdAt");
  });

  it("exports PortalAdminReview select type with all required columns", () => {
    const _check: PortalAdminReview = {
      id: "uuid-1",
      postingId: "uuid-2",
      reviewerUserId: "uuid-3",
      decision: "approved",
      feedbackComment: null,
      reviewedAt: new Date(),
      createdAt: new Date(),
    };
    expect(_check.id).toBe("uuid-1");
    expect(_check.decision).toBe("approved");
    expect(_check.feedbackComment).toBeNull();
  });

  it("exports NewPortalAdminReview insert type with required fields", () => {
    const _check: NewPortalAdminReview = {
      postingId: "uuid-2",
      reviewerUserId: "uuid-3",
      decision: "rejected",
    };
    expect(_check.decision).toBe("rejected");
  });

  it("NewPortalAdminReview allows optional feedbackComment", () => {
    const _check: NewPortalAdminReview = {
      postingId: "uuid-2",
      reviewerUserId: "uuid-3",
      decision: "changes_requested",
      feedbackComment: "Please update the salary range",
    };
    expect(_check.feedbackComment).toBe("Please update the salary range");
  });

  it("AdminReviewDecision type accepts all valid values", () => {
    const approved: AdminReviewDecision = "approved";
    const rejected: AdminReviewDecision = "rejected";
    const changesRequested: AdminReviewDecision = "changes_requested";
    expect(approved).toBe("approved");
    expect(rejected).toBe("rejected");
    expect(changesRequested).toBe("changes_requested");
  });

  it("has id column as primary key", () => {
    expect(portalAdminReviews.id).toBeDefined();
  });

  it("has postingId column referencing portal_job_postings", () => {
    expect(portalAdminReviews.postingId).toBeDefined();
  });

  it("has reviewerUserId column referencing auth_users", () => {
    expect(portalAdminReviews.reviewerUserId).toBeDefined();
  });
});
