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

  it("has exactly 26 error codes", () => {
    expect(Object.keys(PORTAL_ERRORS)).toHaveLength(26);
  });

  it("has DUPLICATE_SEEKER_PROFILE key", () => {
    expect(PORTAL_ERRORS.DUPLICATE_SEEKER_PROFILE).toBe("PORTAL_ERRORS.DUPLICATE_SEEKER_PROFILE");
  });

  it("has APPROVAL_INTEGRITY_VIOLATION key", () => {
    expect(PORTAL_ERRORS.APPROVAL_INTEGRITY_VIOLATION).toBe(
      "PORTAL_ERRORS.APPROVAL_INTEGRITY_VIOLATION",
    );
  });

  it("has MAX_REVISIONS_REACHED key", () => {
    expect(PORTAL_ERRORS.MAX_REVISIONS_REACHED).toBe("PORTAL_ERRORS.MAX_REVISIONS_REACHED");
  });

  it("has ALREADY_SHARED key", () => {
    expect(PORTAL_ERRORS.ALREADY_SHARED).toBe("PORTAL_ERRORS.ALREADY_SHARED");
  });

  it("has DUPLICATE_COMPANY_PROFILE key", () => {
    expect(PORTAL_ERRORS.DUPLICATE_COMPANY_PROFILE).toBe("PORTAL_ERRORS.DUPLICATE_COMPANY_PROFILE");
  });

  it("PortalErrorCode type-level check", () => {
    const _code: PortalErrorCode = PORTAL_ERRORS.ROLE_MISMATCH;
    expect(_code).toBe("PORTAL_ERRORS.ROLE_MISMATCH");
  });

  it("has CV_LIMIT_REACHED key", () => {
    expect(PORTAL_ERRORS.CV_LIMIT_REACHED).toBe("PORTAL_ERRORS.CV_LIMIT_REACHED");
  });

  it("has SEEKER_PROFILE_REQUIRED key", () => {
    expect(PORTAL_ERRORS.SEEKER_PROFILE_REQUIRED).toBe("PORTAL_ERRORS.SEEKER_PROFILE_REQUIRED");
  });

  it("has INVALID_FILE_TYPE key", () => {
    expect(PORTAL_ERRORS.INVALID_FILE_TYPE).toBe("PORTAL_ERRORS.INVALID_FILE_TYPE");
  });

  it("has FILE_TOO_LARGE key", () => {
    expect(PORTAL_ERRORS.FILE_TOO_LARGE).toBe("PORTAL_ERRORS.FILE_TOO_LARGE");
  });

  it("has ALREADY_FLAGGED key", () => {
    expect(PORTAL_ERRORS.ALREADY_FLAGGED).toBe("PORTAL_ERRORS.ALREADY_FLAGGED");
  });

  it("has FLAG_NOT_FOUND key", () => {
    expect(PORTAL_ERRORS.FLAG_NOT_FOUND).toBe("PORTAL_ERRORS.FLAG_NOT_FOUND");
  });

  it("has INVALID_FLAG_TARGET key", () => {
    expect(PORTAL_ERRORS.INVALID_FLAG_TARGET).toBe("PORTAL_ERRORS.INVALID_FLAG_TARGET");
  });

  it("has ALREADY_REPORTED key", () => {
    expect(PORTAL_ERRORS.ALREADY_REPORTED).toBe("PORTAL_ERRORS.ALREADY_REPORTED");
  });

  it("has REPORT_NOT_FOUND key", () => {
    expect(PORTAL_ERRORS.REPORT_NOT_FOUND).toBe("PORTAL_ERRORS.REPORT_NOT_FOUND");
  });

  it("has CANNOT_REPORT_OWN_POSTING key", () => {
    expect(PORTAL_ERRORS.CANNOT_REPORT_OWN_POSTING).toBe("PORTAL_ERRORS.CANNOT_REPORT_OWN_POSTING");
  });

  it("has CONVERSATION_READ_ONLY key", () => {
    expect(PORTAL_ERRORS.CONVERSATION_READ_ONLY).toBe("PORTAL_ERRORS.CONVERSATION_READ_ONLY");
  });

  it("has SEEKER_CANNOT_INITIATE key", () => {
    expect(PORTAL_ERRORS.SEEKER_CANNOT_INITIATE).toBe("PORTAL_ERRORS.SEEKER_CANNOT_INITIATE");
  });

  it("has MESSAGING_APPLICATION_NOT_FOUND key", () => {
    expect(PORTAL_ERRORS.MESSAGING_APPLICATION_NOT_FOUND).toBe(
      "PORTAL_ERRORS.MESSAGING_APPLICATION_NOT_FOUND",
    );
  });
});
