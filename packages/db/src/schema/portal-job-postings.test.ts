// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  portalJobPostings,
  portalEmploymentTypeEnum,
  portalJobStatusEnum,
  portalClosedOutcomeEnum,
  type PortalJobPosting,
  type NewPortalJobPosting,
  type PortalEmploymentType,
  type PortalJobStatus,
  type PortalClosedOutcome,
} from "./portal-job-postings";

describe("portalJobPostings schema", () => {
  it("has all required columns", () => {
    const cols = Object.keys(portalJobPostings);
    expect(cols).toContain("id");
    expect(cols).toContain("companyId");
    expect(cols).toContain("title");
    expect(cols).toContain("descriptionHtml");
    expect(cols).toContain("requirements");
    expect(cols).toContain("salaryMin");
    expect(cols).toContain("salaryMax");
    expect(cols).toContain("salaryCompetitiveOnly");
    expect(cols).toContain("location");
    expect(cols).toContain("employmentType");
    expect(cols).toContain("status");
    expect(cols).toContain("culturalContextJson");
    expect(cols).toContain("descriptionIgboHtml");
    expect(cols).toContain("applicationDeadline");
    expect(cols).toContain("expiresAt");
    expect(cols).toContain("createdAt");
    expect(cols).toContain("updatedAt");
  });

  it("has new lifecycle columns (adminFeedbackComment, closedOutcome, closedAt)", () => {
    const cols = Object.keys(portalJobPostings);
    expect(cols).toContain("adminFeedbackComment");
    expect(cols).toContain("closedOutcome");
    expect(cols).toContain("closedAt");
  });

  it("has archivedAt column for soft-archive support", () => {
    const cols = Object.keys(portalJobPostings);
    expect(cols).toContain("archivedAt");
  });

  it("has viewCount and communityPostId columns for analytics and share tracking", () => {
    const cols = Object.keys(portalJobPostings);
    expect(cols).toContain("viewCount");
    expect(cols).toContain("communityPostId");
  });

  it("has revisionCount column for admin review cycle tracking", () => {
    const cols = Object.keys(portalJobPostings);
    expect(cols).toContain("revisionCount");
  });

  it("exports PortalJobPosting select type with all required columns", () => {
    const _check: PortalJobPosting = {
      id: "uuid-1",
      companyId: "uuid-2",
      title: "Senior Engineer",
      descriptionHtml: null,
      requirements: null,
      salaryMin: null,
      salaryMax: null,
      salaryCompetitiveOnly: false,
      location: null,
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
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(_check.id).toBe("uuid-1");
    expect(_check.status).toBe("draft");
    expect(_check.adminFeedbackComment).toBeNull();
    expect(_check.closedOutcome).toBeNull();
    expect(_check.closedAt).toBeNull();
  });

  it("exports NewPortalJobPosting insert type", () => {
    const _check: NewPortalJobPosting = {
      companyId: "uuid-2",
      title: "Engineer",
      employmentType: "contract",
    };
    expect(_check.employmentType).toBe("contract");
  });

  it("NewPortalJobPosting type auto-expands to include lifecycle fields", () => {
    const _check: NewPortalJobPosting = {
      companyId: "uuid-2",
      title: "Engineer",
      employmentType: "contract",
      adminFeedbackComment: "Missing required information",
      closedOutcome: "filled_via_portal",
      closedAt: new Date(),
    };
    expect(_check.adminFeedbackComment).toBe("Missing required information");
    expect(_check.closedOutcome).toBe("filled_via_portal");
  });

  it("portalEmploymentTypeEnum has all 5 values", () => {
    expect(portalEmploymentTypeEnum.enumValues).toHaveLength(5);
    expect(portalEmploymentTypeEnum.enumValues).toContain("full_time");
    expect(portalEmploymentTypeEnum.enumValues).toContain("part_time");
    expect(portalEmploymentTypeEnum.enumValues).toContain("contract");
    expect(portalEmploymentTypeEnum.enumValues).toContain("internship");
    expect(portalEmploymentTypeEnum.enumValues).toContain("apprenticeship");
  });

  it("portalJobStatusEnum has all 7 values", () => {
    expect(portalJobStatusEnum.enumValues).toHaveLength(7);
    expect(portalJobStatusEnum.enumValues).toContain("draft");
    expect(portalJobStatusEnum.enumValues).toContain("pending_review");
    expect(portalJobStatusEnum.enumValues).toContain("active");
    expect(portalJobStatusEnum.enumValues).toContain("paused");
    expect(portalJobStatusEnum.enumValues).toContain("filled");
    expect(portalJobStatusEnum.enumValues).toContain("expired");
    expect(portalJobStatusEnum.enumValues).toContain("rejected");
  });

  it("portalClosedOutcomeEnum has all 3 values", () => {
    expect(portalClosedOutcomeEnum.enumValues).toHaveLength(3);
    expect(portalClosedOutcomeEnum.enumValues).toContain("filled_via_portal");
    expect(portalClosedOutcomeEnum.enumValues).toContain("filled_internally");
    expect(portalClosedOutcomeEnum.enumValues).toContain("cancelled");
  });

  it("PortalEmploymentType, PortalJobStatus, and PortalClosedOutcome type-level check", () => {
    const _et: PortalEmploymentType = "full_time";
    const _js: PortalJobStatus = "active";
    const _co: PortalClosedOutcome = "filled_via_portal";
    expect(_et).toBe("full_time");
    expect(_js).toBe("active");
    expect(_co).toBe("filled_via_portal");
  });
});
