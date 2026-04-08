// @vitest-environment node
import { describe, it, expect } from "vitest";
import { seekerProfileSchema, experienceEntrySchema, educationEntrySchema } from "./seeker-profile";

describe("seekerProfileSchema", () => {
  it("accepts valid minimal input (headline only) with array defaults", () => {
    const result = seekerProfileSchema.safeParse({ headline: "Senior Dev" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.skills).toEqual([]);
      expect(result.data.experience).toEqual([]);
      expect(result.data.education).toEqual([]);
    }
  });

  it("rejects empty headline", () => {
    const result = seekerProfileSchema.safeParse({ headline: "" });
    expect(result.success).toBe(false);
  });

  it("rejects headline longer than 200 chars", () => {
    const result = seekerProfileSchema.safeParse({ headline: "x".repeat(201) });
    expect(result.success).toBe(false);
  });

  it("rejects skills array with more than 30 items", () => {
    const skills = Array.from({ length: 31 }, (_, i) => `skill${i}`);
    const result = seekerProfileSchema.safeParse({ headline: "Dev", skills });
    expect(result.success).toBe(false);
  });

  it("rejects skill string longer than 50 chars", () => {
    const result = seekerProfileSchema.safeParse({
      headline: "Dev",
      skills: ["x".repeat(51)],
    });
    expect(result.success).toBe(false);
  });

  it("accepts skills array with exactly 30 items", () => {
    const skills = Array.from({ length: 30 }, (_, i) => `skill${i}`);
    const result = seekerProfileSchema.safeParse({ headline: "Dev", skills });
    expect(result.success).toBe(true);
  });

  it("accepts optional summary up to 5000 chars", () => {
    const result = seekerProfileSchema.safeParse({
      headline: "Dev",
      summary: "x".repeat(5000),
    });
    expect(result.success).toBe(true);
  });

  it("rejects summary longer than 5000 chars", () => {
    const result = seekerProfileSchema.safeParse({
      headline: "Dev",
      summary: "x".repeat(5001),
    });
    expect(result.success).toBe(false);
  });
});

describe("experienceEntrySchema", () => {
  it("rejects startDate not in YYYY-MM format", () => {
    const result = experienceEntrySchema.safeParse({
      title: "Dev",
      company: "Corp",
      startDate: "01-2023",
      endDate: "Present",
    });
    expect(result.success).toBe(false);
  });

  it("accepts endDate as 'Present'", () => {
    const result = experienceEntrySchema.safeParse({
      title: "Dev",
      company: "Corp",
      startDate: "2022-01",
      endDate: "Present",
    });
    expect(result.success).toBe(true);
  });

  it("accepts endDate in YYYY-MM format", () => {
    const result = experienceEntrySchema.safeParse({
      title: "Dev",
      company: "Corp",
      startDate: "2020-06",
      endDate: "2023-12",
    });
    expect(result.success).toBe(true);
  });

  it("rejects endDate with invalid format", () => {
    const result = experienceEntrySchema.safeParse({
      title: "Dev",
      company: "Corp",
      startDate: "2022-01",
      endDate: "2023",
    });
    expect(result.success).toBe(false);
  });
});

describe("educationEntrySchema", () => {
  it("rejects graduationYear below 1950", () => {
    const result = educationEntrySchema.safeParse({
      institution: "Uni",
      degree: "BSc",
      field: "CS",
      graduationYear: 1949,
    });
    expect(result.success).toBe(false);
  });

  it("accepts graduationYear at 1950", () => {
    const result = educationEntrySchema.safeParse({
      institution: "Uni",
      degree: "BSc",
      field: "CS",
      graduationYear: 1950,
    });
    expect(result.success).toBe(true);
  });

  it("rejects graduationYear beyond currentYear + 7", () => {
    const maxYear = new Date().getFullYear() + 7;
    const result = educationEntrySchema.safeParse({
      institution: "Uni",
      degree: "BSc",
      field: "CS",
      graduationYear: maxYear + 1,
    });
    expect(result.success).toBe(false);
  });

  it("accepts graduationYear at currentYear + 7", () => {
    const maxYear = new Date().getFullYear() + 7;
    const result = educationEntrySchema.safeParse({
      institution: "Uni",
      degree: "BSc",
      field: "CS",
      graduationYear: maxYear,
    });
    expect(result.success).toBe(true);
  });
});
