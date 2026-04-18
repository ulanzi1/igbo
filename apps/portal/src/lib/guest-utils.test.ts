import { describe, it, expect } from "vitest";
import { buildSignInUrl } from "./guest-utils";

describe("buildSignInUrl", () => {
  it("builds basic sign-in URL with callbackUrl", () => {
    const result = buildSignInUrl("https://igbo.com", "https://jobs.igbo.com/en/jobs/abc123");
    expect(result).toBe(
      `https://igbo.com/login?callbackUrl=${encodeURIComponent("https://jobs.igbo.com/en/jobs/abc123")}`,
    );
  });

  it("appends ref=apply to callbackUrl when ref option is provided", () => {
    const result = buildSignInUrl("https://igbo.com", "https://jobs.igbo.com/en/jobs/abc123", {
      ref: "apply",
    });
    const expectedCallback = "https://jobs.igbo.com/en/jobs/abc123?ref=apply";
    expect(result).toBe(
      `https://igbo.com/login?callbackUrl=${encodeURIComponent(expectedCallback)}`,
    );
  });

  it("handles currentUrl that already has search params when adding ref", () => {
    const currentUrl = "https://jobs.igbo.com/en/jobs/abc123?foo=bar";
    const result = buildSignInUrl("https://igbo.com", currentUrl, { ref: "apply" });
    const expectedCallback = "https://jobs.igbo.com/en/jobs/abc123?foo=bar&ref=apply";
    expect(result).toBe(
      `https://igbo.com/login?callbackUrl=${encodeURIComponent(expectedCallback)}`,
    );
  });

  it("does not append ref when no options provided", () => {
    const result = buildSignInUrl("https://igbo.com", "https://jobs.igbo.com/en/search?q=dev");
    expect(result).not.toContain("ref=");
    expect(result).toContain("callbackUrl=");
  });

  it("encodes special characters in the callbackUrl", () => {
    const result = buildSignInUrl(
      "https://igbo.com",
      "https://jobs.igbo.com/en/search?q=software+engineer",
    );
    expect(result).toContain(encodeURIComponent("https://jobs.igbo.com"));
  });
});
