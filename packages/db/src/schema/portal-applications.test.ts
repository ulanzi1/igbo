// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  portalApplications,
  portalApplicationStatusEnum,
  type PortalApplication,
  type NewPortalApplication,
  type PortalApplicationStatus,
} from "./portal-applications";

describe("portalApplications schema", () => {
  it("has all required columns", () => {
    const cols = Object.keys(portalApplications);
    expect(cols).toContain("id");
    expect(cols).toContain("jobId");
    expect(cols).toContain("seekerUserId");
    expect(cols).toContain("status");
    expect(cols).toContain("createdAt");
    expect(cols).toContain("updatedAt");
  });

  it("exports PortalApplication select type with all required columns", () => {
    const _check: PortalApplication = {
      id: "uuid-1",
      jobId: "uuid-2",
      seekerUserId: "uuid-3",
      status: "submitted",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(_check.id).toBe("uuid-1");
    expect(_check.status).toBe("submitted");
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
