// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { contactInfoLeakRule } from "./contact-info-leak.rule";
import type { ScreeningInput } from "../types";

const baseInput: ScreeningInput = {
  title: "Engineer",
  descriptionHtml: "<p>A good job description with no contact info.</p>",
  descriptionIgboHtml: null,
  employmentType: "full_time",
  salaryMin: 200_000,
  salaryMax: 500_000,
  salaryCompetitiveOnly: false,
};

describe("contactInfoLeakRule", () => {
  it("returns no flags for clean description", () => {
    expect(contactInfoLeakRule(baseInput)).toEqual([]);
  });

  it("returns empty for null description", () => {
    expect(contactInfoLeakRule({ ...baseInput, descriptionHtml: null })).toEqual([]);
  });

  it("flags phone number", () => {
    const input = {
      ...baseInput,
      descriptionHtml: "<p>Contact us at +234 801 234 5678 for details.</p>",
    };
    const flags = contactInfoLeakRule(input);
    const phoneFlag = flags.find((f) => f.rule_id === "contact_info_leak");
    expect(phoneFlag).toBeDefined();
    expect(phoneFlag?.severity).toBe("medium");
    expect(phoneFlag?.match).toContain("234");
  });

  it("flags email address", () => {
    const input = {
      ...baseInput,
      descriptionHtml: "<p>Send your CV to jobs@example.com for details.</p>",
    };
    const flags = contactInfoLeakRule(input);
    const emailFlag = flags.find((f) => f.rule_id === "contact_info_leak");
    expect(emailFlag).toBeDefined();
    expect(emailFlag?.match).toContain("@");
  });

  it("flags external URL", () => {
    const input = {
      ...baseInput,
      descriptionHtml: "<p>Apply at https://externalsite.com/apply today.</p>",
    };
    const flags = contactInfoLeakRule(input);
    const urlFlag = flags.find((f) => f.rule_id === "contact_info_leak");
    expect(urlFlag).toBeDefined();
    expect(urlFlag?.match).toContain("https://");
  });

  it("flags multiple types simultaneously", () => {
    const input = {
      ...baseInput,
      descriptionHtml:
        "<p>Call +234 800 000 0000 or email hr@company.com or visit https://apply.io</p>",
    };
    const flags = contactInfoLeakRule(input);
    expect(flags.length).toBeGreaterThanOrEqual(2);
    const ruleIds = flags.map((f) => f.rule_id);
    expect(ruleIds).toContain("contact_info_leak");
  });

  it("all flags have medium severity", () => {
    const input = {
      ...baseInput,
      descriptionHtml: "<p>Email hr@example.com or call +234 801 234 5678.</p>",
    };
    const flags = contactInfoLeakRule(input);
    for (const flag of flags) {
      expect(flag.severity).toBe("medium");
    }
  });
});
