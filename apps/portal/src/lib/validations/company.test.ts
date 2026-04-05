// @vitest-environment node
import { describe, it, expect } from "vitest";

import { companyProfileSchema } from "./company";

describe("companyProfileSchema", () => {
  it("passes with minimal valid input (name only)", () => {
    const result = companyProfileSchema.safeParse({ name: "Acme Corp" });
    expect(result.success).toBe(true);
  });

  it("passes with full valid input", () => {
    const result = companyProfileSchema.safeParse({
      name: "Acme Corp",
      logoUrl: "https://example.com/logo.png",
      description: "A great company",
      industry: "technology",
      companySize: "11-50",
      cultureInfo: "We value innovation",
    });
    expect(result.success).toBe(true);
  });

  it("fails with empty name", () => {
    const result = companyProfileSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.message).toBe("Company name is required");
    }
  });

  it("fails when name exceeds 200 characters", () => {
    const result = companyProfileSchema.safeParse({ name: "A".repeat(201) });
    expect(result.success).toBe(false);
  });

  it("fails with invalid industry value", () => {
    const result = companyProfileSchema.safeParse({ name: "Acme", industry: "invalid_industry" });
    expect(result.success).toBe(false);
  });

  it("fails with invalid company size value", () => {
    const result = companyProfileSchema.safeParse({ name: "Acme", companySize: "1000+" });
    expect(result.success).toBe(false);
  });

  it("passes with empty logoUrl string", () => {
    const result = companyProfileSchema.safeParse({ name: "Acme", logoUrl: "" });
    expect(result.success).toBe(true);
  });
});
