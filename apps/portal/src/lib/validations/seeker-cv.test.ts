// @vitest-environment node
import { describe, it, expect } from "vitest";
import { cvLabelSchema, cvUpdateSchema } from "./seeker-cv";

describe("cvLabelSchema", () => {
  it("accepts a valid label", () => {
    expect(cvLabelSchema.safeParse("Technical CV").success).toBe(true);
  });

  it("rejects empty label", () => {
    expect(cvLabelSchema.safeParse("").success).toBe(false);
  });

  it("rejects label longer than 100 characters", () => {
    expect(cvLabelSchema.safeParse("a".repeat(101)).success).toBe(false);
  });
});

describe("cvUpdateSchema", () => {
  it("accepts partial PATCH with label only", () => {
    const result = cvUpdateSchema.safeParse({ label: "Management CV" });
    expect(result.success).toBe(true);
  });

  it("accepts partial PATCH with isDefault only", () => {
    const result = cvUpdateSchema.safeParse({ isDefault: true });
    expect(result.success).toBe(true);
  });

  it("accepts both fields together", () => {
    const result = cvUpdateSchema.safeParse({ label: "New CV", isDefault: true });
    expect(result.success).toBe(true);
  });

  it("rejects empty body (no fields)", () => {
    const result = cvUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects non-boolean isDefault", () => {
    const result = cvUpdateSchema.safeParse({ isDefault: "yes" });
    expect(result.success).toBe(false);
  });
});
