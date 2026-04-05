// @vitest-environment node
import { describe, it, expect } from "vitest";
import { jobPostingSchema, culturalContextSchema } from "./job-posting";

describe("jobPostingSchema", () => {
  const validMinimal = {
    title: "Software Engineer",
    employmentType: "full_time" as const,
  };

  const validFull = {
    title: "Senior Product Manager",
    employmentType: "contract" as const,
    descriptionHtml: "<p>Great role with growth opportunities.</p>",
    requirements: "<p>5+ years experience required.</p>",
    salaryMin: 500000,
    salaryMax: 750000,
    salaryCompetitiveOnly: false,
    location: "Lagos, Nigeria",
    applicationDeadline: "2026-06-01T00:00:00.000Z",
  };

  it("passes with valid minimal input (title + employmentType)", () => {
    const result = jobPostingSchema.safeParse(validMinimal);
    expect(result.success).toBe(true);
  });

  it("passes with valid full input", () => {
    const result = jobPostingSchema.safeParse(validFull);
    expect(result.success).toBe(true);
  });

  it("fails when title is empty", () => {
    const result = jobPostingSchema.safeParse({ ...validMinimal, title: "" });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.path).toContain("title");
  });

  it("fails when title exceeds 200 characters", () => {
    const result = jobPostingSchema.safeParse({ ...validMinimal, title: "a".repeat(201) });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.path).toContain("title");
  });

  it("fails with invalid employment type", () => {
    const result = jobPostingSchema.safeParse({ ...validMinimal, employmentType: "freelance" });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.path).toContain("employmentType");
  });

  it("fails with negative salary", () => {
    const result = jobPostingSchema.safeParse({ ...validMinimal, salaryMin: -1 });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.path).toContain("salaryMin");
  });

  it("fails refinement when salary min > salary max", () => {
    const result = jobPostingSchema.safeParse({
      ...validMinimal,
      salaryMin: 800000,
      salaryMax: 500000,
    });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.path).toContain("salaryMin");
  });

  it("passes when salary min equals salary max", () => {
    const result = jobPostingSchema.safeParse({
      ...validMinimal,
      salaryMin: 500000,
      salaryMax: 500000,
    });
    expect(result.success).toBe(true);
  });

  it("fails when description exceeds 50000 characters", () => {
    const result = jobPostingSchema.safeParse({
      ...validMinimal,
      descriptionHtml: "a".repeat(50001),
    });
    expect(result.success).toBe(false);
  });

  it("salaryCompetitiveOnly defaults to false", () => {
    const result = jobPostingSchema.safeParse(validMinimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.salaryCompetitiveOnly).toBe(false);
    }
  });

  it("rejects apprenticeship employment type (reserved for P-8.x)", () => {
    const result = jobPostingSchema.safeParse({
      ...validMinimal,
      employmentType: "apprenticeship",
    });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.path).toContain("employmentType");
  });

  it("passes when only salaryMin is set (no max)", () => {
    const result = jobPostingSchema.safeParse({ ...validMinimal, salaryMin: 300000 });
    expect(result.success).toBe(true);
  });

  it("passes when only salaryMax is set (no min)", () => {
    const result = jobPostingSchema.safeParse({ ...validMinimal, salaryMax: 700000 });
    expect(result.success).toBe(true);
  });
});

describe("cultural context and Igbo description fields", () => {
  const validMinimal = {
    title: "Software Engineer",
    employmentType: "full_time" as const,
  };

  it("passes with valid cultural context JSON (some flags true)", () => {
    const result = jobPostingSchema.safeParse({
      ...validMinimal,
      culturalContextJson: {
        diasporaFriendly: true,
        igboLanguagePreferred: false,
        communityReferred: false,
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.culturalContextJson?.diasporaFriendly).toBe(true);
    }
  });

  it("passes with valid descriptionIgboHtml", () => {
    const result = jobPostingSchema.safeParse({
      ...validMinimal,
      descriptionIgboHtml: "<p>Nkọwa</p>",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.descriptionIgboHtml).toBe("<p>Nkọwa</p>");
    }
  });

  it("passes with both Igbo description and cultural context accepted together", () => {
    const result = jobPostingSchema.safeParse({
      ...validMinimal,
      culturalContextJson: {
        diasporaFriendly: true,
        igboLanguagePreferred: true,
        communityReferred: false,
      },
      descriptionIgboHtml: "<p>Nkọwa</p>",
    });
    expect(result.success).toBe(true);
  });

  it("passes without cultural context (optional field)", () => {
    const result = jobPostingSchema.safeParse(validMinimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.culturalContextJson).toBeUndefined();
    }
  });

  it("passes with null cultural context (explicitly null)", () => {
    const result = jobPostingSchema.safeParse({ ...validMinimal, culturalContextJson: null });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.culturalContextJson).toBeNull();
    }
  });

  it("fails when Igbo description exceeds 50000 characters", () => {
    const result = jobPostingSchema.safeParse({
      ...validMinimal,
      descriptionIgboHtml: "a".repeat(50001),
    });
    expect(result.success).toBe(false);
  });

  it("fails with invalid cultural context shape (wrong boolean type)", () => {
    const result = jobPostingSchema.safeParse({
      ...validMinimal,
      culturalContextJson: {
        diasporaFriendly: "yes",
        igboLanguagePreferred: false,
        communityReferred: false,
      },
    });
    expect(result.success).toBe(false);
  });
});

describe("culturalContextSchema", () => {
  it("cultural context booleans default to false when not provided", () => {
    const result = culturalContextSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.diasporaFriendly).toBe(false);
      expect(result.data.igboLanguagePreferred).toBe(false);
      expect(result.data.communityReferred).toBe(false);
    }
  });

  it("passes with all flags explicitly set to true", () => {
    const result = culturalContextSchema.safeParse({
      diasporaFriendly: true,
      igboLanguagePreferred: true,
      communityReferred: true,
    });
    expect(result.success).toBe(true);
  });
});
