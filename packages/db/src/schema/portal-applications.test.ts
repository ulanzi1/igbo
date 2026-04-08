// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  portalApplications,
  portalApplicationTransitions,
  portalApplicationStatusEnum,
  portalActorRoleEnum,
  type PortalApplication,
  type NewPortalApplication,
  type PortalApplicationStatus,
  type PortalActorRole,
  type PortalApplicationTransition,
  type NewPortalApplicationTransition,
} from "./portal-applications";

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
  // These constants are defined inline in application-state-machine.ts (PREP-A not merged yet)
  // Ensure the enum values match what the state machine considers terminal
  const APPLICATION_TERMINAL_STATES = ["hired", "rejected", "withdrawn"] as const;

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
