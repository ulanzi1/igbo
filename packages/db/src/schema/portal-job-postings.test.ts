// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  portalJobPostings,
  portalEmploymentTypeEnum,
  portalJobStatusEnum,
  portalClosedOutcomeEnum,
  JOB_HARD_TERMINAL_STATES,
  JOB_SOFT_TERMINAL_STATES,
  isHardTerminalJobStatus,
  isSoftTerminalJobStatus,
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

  it("has enableCoverLetter column for P-2.5A application submission", () => {
    const cols = Object.keys(portalJobPostings);
    expect(cols).toContain("enableCoverLetter");
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
      screeningStatus: null,
      screeningResultJson: null,
      screeningCheckedAt: null,
      enableCoverLetter: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(_check.id).toBe("uuid-1");
    expect(_check.status).toBe("draft");
    expect(_check.adminFeedbackComment).toBeNull();
    expect(_check.closedOutcome).toBeNull();
    expect(_check.closedAt).toBeNull();
    expect(_check.enableCoverLetter).toBe(false);
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

  // F13: split — set equality guards classification exhaustiveness (order-free);
  // sequence equality guards Postgres enum compatibility (order matters to pg).
  it("portalJobStatusEnum set equals the 7 expected values (classification)", () => {
    expect([...portalJobStatusEnum.enumValues].sort()).toEqual(
      ["draft", "pending_review", "active", "paused", "filled", "expired", "rejected"].sort(),
    );
  });

  it("portalJobStatusEnum sequence is stable (Postgres enum order)", () => {
    expect(portalJobStatusEnum.enumValues).toEqual([
      "draft",
      "pending_review",
      "active",
      "paused",
      "filled",
      "expired",
      "rejected",
    ]);
  });
});

describe("portal-job-postings terminal classification (PREP-A)", () => {
  it("JOB_HARD_TERMINAL_STATES contains exactly ['filled']", () => {
    expect(JOB_HARD_TERMINAL_STATES).toEqual(["filled"]);
  });

  it("JOB_SOFT_TERMINAL_STATES contains exactly ['expired']", () => {
    expect(JOB_SOFT_TERMINAL_STATES).toEqual(["expired"]);
  });

  it("hard and soft terminal sets are disjoint", () => {
    const intersection = JOB_HARD_TERMINAL_STATES.filter((s) =>
      (JOB_SOFT_TERMINAL_STATES as readonly string[]).includes(s),
    );
    expect(intersection).toEqual([]);
  });

  // Drift guard — explicit expected non-terminal list. When a future dev adds
  // a new value to portalJobStatusEnum without updating the constants above,
  // this test fails with a clear diff. Retro Lesson 2 real enforcement.
  it("exhaustiveness: every enum value is classified terminal or non-terminal", () => {
    const classified = new Set<string>([...JOB_HARD_TERMINAL_STATES, ...JOB_SOFT_TERMINAL_STATES]);
    // Sanity: all classified values actually exist in the enum.
    for (const s of classified) {
      expect(portalJobStatusEnum.enumValues as readonly string[]).toContain(s);
    }
    const expectedNonTerminal: PortalJobStatus[] = [
      "draft",
      "pending_review",
      "active",
      "paused",
      "rejected",
    ];
    const actualNonTerminal = portalJobStatusEnum.enumValues.filter((s) => !classified.has(s));
    expect([...actualNonTerminal].sort()).toEqual([...expectedNonTerminal].sort());
  });

  it("rejected is NOT terminal (TD-1: edit+resubmit loop)", () => {
    expect(isHardTerminalJobStatus("rejected")).toBe(false);
    expect(isSoftTerminalJobStatus("rejected")).toBe(false);
  });

  it("filled is hard terminal", () => {
    expect(isHardTerminalJobStatus("filled")).toBe(true);
  });

  it("expired is soft terminal", () => {
    expect(isSoftTerminalJobStatus("expired")).toBe(true);
  });
});
