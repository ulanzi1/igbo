// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  portalApplications,
  portalApplicationTransitions,
  portalApplicationStatusEnum,
  portalActorRoleEnum,
  APPLICATION_TERMINAL_STATES,
  isTerminalApplicationStatus,
  canAcceptApplications,
  type PortalApplication,
  type NewPortalApplication,
  type PortalApplicationStatus,
  type PortalActorRole,
  type PortalApplicationTransition,
  type NewPortalApplicationTransition,
} from "./portal-applications";
import { portalJobStatusEnum } from "./portal-job-postings";

describe("portalApplications schema", () => {
  it("has all required columns including new audit fields", () => {
    const cols = Object.keys(portalApplications);
    expect(cols).toContain("id");
    expect(cols).toContain("jobId");
    expect(cols).toContain("seekerUserId");
    expect(cols).toContain("status");
    expect(cols).toContain("previousStatus");
    expect(cols).toContain("transitionedAt");
    expect(cols).toContain("transitionedByUserId");
    expect(cols).toContain("transitionReason");
    expect(cols).toContain("createdAt");
    expect(cols).toContain("updatedAt");
  });

  it("exports PortalApplication select type with all required columns", () => {
    const _check: PortalApplication = {
      id: "uuid-1",
      jobId: "uuid-2",
      seekerUserId: "uuid-3",
      status: "submitted",
      previousStatus: null,
      transitionedAt: null,
      transitionedByUserId: null,
      transitionReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(_check.id).toBe("uuid-1");
    expect(_check.status).toBe("submitted");
    expect(_check.previousStatus).toBeNull();
    expect(_check.transitionedAt).toBeNull();
    expect(_check.transitionedByUserId).toBeNull();
    expect(_check.transitionReason).toBeNull();
  });

  it("exports NewPortalApplication insert type", () => {
    const _check: NewPortalApplication = {
      jobId: "uuid-2",
      seekerUserId: "uuid-3",
    };
    expect(_check.jobId).toBe("uuid-2");
  });

  it("portalApplicationStatusEnum has all 8 values", () => {
    expect(portalApplicationStatusEnum.enumValues).toHaveLength(8);
    expect(portalApplicationStatusEnum.enumValues).toContain("submitted");
    expect(portalApplicationStatusEnum.enumValues).toContain("under_review");
    expect(portalApplicationStatusEnum.enumValues).toContain("shortlisted");
    expect(portalApplicationStatusEnum.enumValues).toContain("interview");
    expect(portalApplicationStatusEnum.enumValues).toContain("offered");
    expect(portalApplicationStatusEnum.enumValues).toContain("hired");
    expect(portalApplicationStatusEnum.enumValues).toContain("rejected");
    expect(portalApplicationStatusEnum.enumValues).toContain("withdrawn");
  });

  it("PortalApplicationStatus type-level check", () => {
    const _status: PortalApplicationStatus = "under_review";
    expect(_status).toBe("under_review");
  });

  // F13: split classification-set equality from Postgres-order sequence equality.
  it("portalApplicationStatusEnum set equals the 8 expected values (classification)", () => {
    expect([...portalApplicationStatusEnum.enumValues].sort()).toEqual(
      [
        "submitted",
        "under_review",
        "shortlisted",
        "interview",
        "offered",
        "hired",
        "rejected",
        "withdrawn",
      ].sort(),
    );
  });

  it("portalApplicationStatusEnum sequence is stable (Postgres enum order)", () => {
    expect(portalApplicationStatusEnum.enumValues).toEqual([
      "submitted",
      "under_review",
      "shortlisted",
      "interview",
      "offered",
      "hired",
      "rejected",
      "withdrawn",
    ]);
  });
});

describe("portal-applications terminal classification (PREP-A)", () => {
  it("APPLICATION_TERMINAL_STATES contains exactly [hired, rejected, withdrawn]", () => {
    expect([...APPLICATION_TERMINAL_STATES].sort()).toEqual(
      ["hired", "rejected", "withdrawn"].sort(),
    );
  });

  it("every enum value is classified terminal or non-terminal (exhaustiveness)", () => {
    // Drift guard — explicit expected non-terminal set. Fails if enum drifts.
    const expectedNonTerminal: PortalApplicationStatus[] = [
      "submitted",
      "under_review",
      "shortlisted",
      "interview",
      "offered",
    ];
    const actualNonTerminal = portalApplicationStatusEnum.enumValues.filter(
      (s) => !isTerminalApplicationStatus(s),
    );
    expect([...actualNonTerminal].sort()).toEqual([...expectedNonTerminal].sort());
  });

  it("offered is NOT terminal (TD-10: offered → hired | rejected)", () => {
    expect(isTerminalApplicationStatus("offered")).toBe(false);
  });

  it("hired, rejected, withdrawn are all terminal", () => {
    expect(isTerminalApplicationStatus("hired")).toBe(true);
    expect(isTerminalApplicationStatus("rejected")).toBe(true);
    expect(isTerminalApplicationStatus("withdrawn")).toBe(true);
  });

  // Reverse-sanity loop — every non-terminal application status must return
  // false from the guard.
  it("every non-terminal application status returns false from isTerminalApplicationStatus", () => {
    const nonTerminal: PortalApplicationStatus[] = [
      "submitted",
      "under_review",
      "shortlisted",
      "interview",
      "offered",
    ];
    for (const s of nonTerminal) {
      expect(isTerminalApplicationStatus(s)).toBe(false);
    }
  });
});

describe("canAcceptApplications precondition (PREP-A)", () => {
  it("returns true for exactly one status ('active')", () => {
    const accepting = portalJobStatusEnum.enumValues.filter((s) => canAcceptApplications(s));
    expect(accepting).toEqual(["active"]);
  });

  // Derive the rejected list from the enum instead of hardcoding — stays honest
  // when new job statuses are added; exhaustiveness falls out automatically.
  it("rejects every job status except 'active'", () => {
    const rejected = portalJobStatusEnum.enumValues.filter((s) => s !== "active");
    for (const s of rejected) {
      expect(canAcceptApplications(s)).toBe(false);
    }
  });
});

describe("portalActorRoleEnum", () => {
  it("has exactly 3 values: job_seeker, employer, job_admin", () => {
    expect(portalActorRoleEnum.enumValues).toHaveLength(3);
    expect(portalActorRoleEnum.enumValues).toContain("job_seeker");
    expect(portalActorRoleEnum.enumValues).toContain("employer");
    expect(portalActorRoleEnum.enumValues).toContain("job_admin");
  });

  it("PortalActorRole type-level check", () => {
    const _role: PortalActorRole = "employer";
    expect(_role).toBe("employer");
  });
});

describe("portalApplicationTransitions schema", () => {
  it("has all required columns", () => {
    const cols = Object.keys(portalApplicationTransitions);
    expect(cols).toContain("id");
    expect(cols).toContain("applicationId");
    expect(cols).toContain("fromStatus");
    expect(cols).toContain("toStatus");
    expect(cols).toContain("actorUserId");
    expect(cols).toContain("actorRole");
    expect(cols).toContain("reason");
    expect(cols).toContain("createdAt");
  });

  it("exports PortalApplicationTransition select type", () => {
    const _check: PortalApplicationTransition = {
      id: "t-uuid-1",
      applicationId: "app-uuid-1",
      fromStatus: "submitted",
      toStatus: "under_review",
      actorUserId: "user-uuid-1",
      actorRole: "employer",
      reason: null,
      createdAt: new Date(),
    };
    expect(_check.fromStatus).toBe("submitted");
    expect(_check.toStatus).toBe("under_review");
    expect(_check.actorRole).toBe("employer");
    expect(_check.reason).toBeNull();
  });

  it("exports NewPortalApplicationTransition insert type", () => {
    const _check: NewPortalApplicationTransition = {
      applicationId: "app-uuid-1",
      fromStatus: "submitted",
      toStatus: "under_review",
      actorUserId: "user-uuid-1",
      actorRole: "employer",
    };
    expect(_check.actorRole).toBe("employer");
  });
});

describe("Drift-guard: APPLICATION_TERMINAL_STATES alignment", () => {
  it("all terminal states are valid portalApplicationStatusEnum values", () => {
    for (const state of APPLICATION_TERMINAL_STATES) {
      expect(portalApplicationStatusEnum.enumValues).toContain(state);
    }
  });

  it("has exactly 3 terminal states (hired, rejected, withdrawn)", () => {
    expect(APPLICATION_TERMINAL_STATES).toHaveLength(3);
    expect(APPLICATION_TERMINAL_STATES).toContain("hired");
    expect(APPLICATION_TERMINAL_STATES).toContain("rejected");
    expect(APPLICATION_TERMINAL_STATES).toContain("withdrawn");
  });
});
