// @vitest-environment node
import { describe, it, expect } from "vitest";
import { seekerVisibilitySchema, seekerConsentSchema } from "./seeker-visibility";

describe("seekerVisibilitySchema", () => {
  it("accepts active", () => {
    expect(seekerVisibilitySchema.safeParse({ visibility: "active" }).success).toBe(true);
  });

  it("accepts passive", () => {
    expect(seekerVisibilitySchema.safeParse({ visibility: "passive" }).success).toBe(true);
  });

  it("accepts hidden", () => {
    expect(seekerVisibilitySchema.safeParse({ visibility: "hidden" }).success).toBe(true);
  });

  it("rejects invalid enum value", () => {
    const result = seekerVisibilitySchema.safeParse({ visibility: "invisible" });
    expect(result.success).toBe(false);
  });

  it("rejects missing visibility field", () => {
    expect(seekerVisibilitySchema.safeParse({}).success).toBe(false);
  });
});

describe("seekerConsentSchema", () => {
  it("accepts consentMatching only", () => {
    expect(seekerConsentSchema.safeParse({ consentMatching: true }).success).toBe(true);
  });

  it("accepts consentEmployerView only", () => {
    expect(seekerConsentSchema.safeParse({ consentEmployerView: false }).success).toBe(true);
  });

  it("accepts both fields", () => {
    expect(
      seekerConsentSchema.safeParse({ consentMatching: true, consentEmployerView: true }).success,
    ).toBe(true);
  });

  it("rejects empty body (refine: at least one field required)", () => {
    const result = seekerConsentSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.message).toContain("At least one consent field");
    }
  });

  it("rejects non-boolean values", () => {
    expect(seekerConsentSchema.safeParse({ consentMatching: "yes" }).success).toBe(false);
  });
});
