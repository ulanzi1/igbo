// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/db/queries/portal-screening-keywords", () => ({
  getActiveBlocklistPhrases: vi.fn().mockResolvedValue([]),
}));

import { runScreening, RULE_VERSION } from "./index";
import { getActiveBlocklistPhrases } from "@igbo/db/queries/portal-screening-keywords";
import type { ScreeningInput } from "./types";

const validInput: ScreeningInput = {
  title: "Senior Software Engineer",
  descriptionHtml: `<p>${"We are looking for a senior engineer with 5+ years experience. ".repeat(3)}</p>`,
  descriptionIgboHtml: null,
  employmentType: "full_time",
  salaryMin: 200_000,
  salaryMax: 500_000,
  salaryCompetitiveOnly: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getActiveBlocklistPhrases).mockResolvedValue([]);
});

describe("RULE_VERSION", () => {
  it("equals 5 (sum of all 5 MVP rules at version 1)", () => {
    expect(RULE_VERSION).toBe(5);
  });
});

describe("runScreening", () => {
  it("returns pass for a clean posting", async () => {
    const result = await runScreening(validInput);
    expect(result.status).toBe("pass");
    expect(result.flags).toEqual([]);
    expect(result.rule_version).toBe(5);
    expect(result.checked_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns fail when any high-severity flag exists", async () => {
    const result = await runScreening({ ...validInput, title: null });
    expect(result.status).toBe("fail");
    expect(result.flags.some((f) => f.severity === "high")).toBe(true);
  });

  it("returns warning when medium flags exist but no high flags", async () => {
    const result = await runScreening({
      ...validInput,
      descriptionHtml: "<p>Short desc.</p>",
    });
    expect(result.status).toBe("warning");
    expect(result.flags.some((f) => f.severity === "medium")).toBe(true);
    expect(result.flags.some((f) => f.severity === "high")).toBe(false);
  });

  it("fail takes priority over warning when both exist", async () => {
    // Missing title (high) + short description (medium)
    const result = await runScreening({ ...validInput, title: null, descriptionHtml: "<p>x</p>" });
    expect(result.status).toBe("fail");
  });

  it("aggregates flags from multiple rules", async () => {
    const input: ScreeningInput = {
      ...validInput,
      descriptionHtml: "<p>Contact us at hr@example.com for short.</p>", // email + too short
    };
    const result = await runScreening(input);
    const ruleIds = result.flags.map((f) => f.rule_id);
    expect(ruleIds).toContain("contact_info_leak");
    expect(ruleIds).toContain("description_too_short");
  });

  it("uses blocklist phrases from getActiveBlocklistPhrases", async () => {
    vi.mocked(getActiveBlocklistPhrases).mockResolvedValue(["must be male"]);
    const input: ScreeningInput = {
      ...validInput,
      descriptionHtml: `<p>${"x".repeat(150)} applicant must be male only</p>`,
    };
    const result = await runScreening(input);
    const blocklistFlag = result.flags.find((f) => f.rule_id === "blocklist_hit");
    expect(blocklistFlag).toBeDefined();
    expect(result.status).toBe("fail");
  });

  it("checked_at is an ISO-8601 UTC string", async () => {
    const result = await runScreening(validInput);
    expect(() => new Date(result.checked_at)).not.toThrow();
    expect(new Date(result.checked_at).toISOString()).toBe(result.checked_at);
  });

  it("rule_version equals sum of all rule versions", async () => {
    const result = await runScreening(validInput);
    expect(result.rule_version).toBe(RULE_VERSION);
  });
});
