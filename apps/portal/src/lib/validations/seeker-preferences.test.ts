// @vitest-environment node
import { describe, it, expect } from "vitest";
import { seekerPreferencesSchema } from "./seeker-preferences";

describe("seekerPreferencesSchema", () => {
  it("accepts a valid minimal payload", () => {
    const result = seekerPreferencesSchema.safeParse({
      desiredRoles: [],
      locations: [],
      workModes: [],
    });
    expect(result.success).toBe(true);
  });

  it("accepts all fields with valid values", () => {
    const result = seekerPreferencesSchema.safeParse({
      desiredRoles: ["Software Engineer", "Product Manager"],
      salaryMin: 200000,
      salaryMax: 500000,
      salaryCurrency: "NGN",
      locations: ["Lagos", "Remote"],
      workModes: ["remote", "hybrid"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects when salaryMin > salaryMax", () => {
    const result = seekerPreferencesSchema.safeParse({
      desiredRoles: [],
      salaryMin: 500000,
      salaryMax: 200000,
      salaryCurrency: "NGN",
      locations: [],
      workModes: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.message).toContain("salaryRangeInvalid");
    }
  });

  it("rejects duplicate work modes", () => {
    const result = seekerPreferencesSchema.safeParse({
      desiredRoles: [],
      locations: [],
      workModes: ["remote", "remote"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects too many desired roles (> 20)", () => {
    const result = seekerPreferencesSchema.safeParse({
      desiredRoles: Array.from({ length: 21 }, (_, i) => `Role ${i}`),
      locations: [],
      workModes: [],
    });
    expect(result.success).toBe(false);
  });

  it("enforces currency enum — rejects invalid value", () => {
    const result = seekerPreferencesSchema.safeParse({
      desiredRoles: [],
      salaryCurrency: "JPY",
      locations: [],
      workModes: [],
    });
    expect(result.success).toBe(false);
  });

  it("accepts null salary values", () => {
    const result = seekerPreferencesSchema.safeParse({
      desiredRoles: [],
      salaryMin: null,
      salaryMax: null,
      locations: [],
      workModes: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid work mode value", () => {
    const result = seekerPreferencesSchema.safeParse({
      desiredRoles: [],
      locations: [],
      workModes: ["freelance"],
    });
    expect(result.success).toBe(false);
  });
});
