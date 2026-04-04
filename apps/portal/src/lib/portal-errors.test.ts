// @vitest-environment node
import { describe, it, expect } from "vitest";
import { PORTAL_ERRORS, type PortalErrorCode } from "./portal-errors";

describe("PORTAL_ERRORS", () => {
  it("has ROLE_MISMATCH key", () => {
    expect(PORTAL_ERRORS.ROLE_MISMATCH).toBe("PORTAL_ERRORS.ROLE_MISMATCH");
  });

  it("has NOT_FOUND key", () => {
    expect(PORTAL_ERRORS.NOT_FOUND).toBe("PORTAL_ERRORS.NOT_FOUND");
  });

  it("has COMPANY_REQUIRED key", () => {
    expect(PORTAL_ERRORS.COMPANY_REQUIRED).toBe("PORTAL_ERRORS.COMPANY_REQUIRED");
  });

  it("has POSTING_LIMIT_EXCEEDED key", () => {
    expect(PORTAL_ERRORS.POSTING_LIMIT_EXCEEDED).toBe("PORTAL_ERRORS.POSTING_LIMIT_EXCEEDED");
  });

  it("has DUPLICATE_APPLICATION key", () => {
    expect(PORTAL_ERRORS.DUPLICATE_APPLICATION).toBe("PORTAL_ERRORS.DUPLICATE_APPLICATION");
  });

  it("has INVALID_STATUS_TRANSITION key", () => {
    expect(PORTAL_ERRORS.INVALID_STATUS_TRANSITION).toBe("PORTAL_ERRORS.INVALID_STATUS_TRANSITION");
  });

  it("all values follow PORTAL_ERRORS.* namespace pattern", () => {
    for (const value of Object.values(PORTAL_ERRORS)) {
      expect(value).toMatch(/^PORTAL_ERRORS\./);
    }
  });

  it("has exactly 7 error codes", () => {
    expect(Object.keys(PORTAL_ERRORS)).toHaveLength(7);
  });

  it("has DUPLICATE_COMPANY_PROFILE key", () => {
    expect(PORTAL_ERRORS.DUPLICATE_COMPANY_PROFILE).toBe("PORTAL_ERRORS.DUPLICATE_COMPANY_PROFILE");
  });

  it("PortalErrorCode type-level check", () => {
    const _code: PortalErrorCode = PORTAL_ERRORS.ROLE_MISMATCH;
    expect(_code).toBe("PORTAL_ERRORS.ROLE_MISMATCH");
  });
});
