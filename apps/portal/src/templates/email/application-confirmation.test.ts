// @vitest-environment node
import { describe, it, expect } from "vitest";
import { render } from "./application-confirmation";

const DATA = {
  seekerName: "Ada Obi",
  jobTitle: "Senior Engineer",
  companyName: "Igbo Tech",
  submittedAt: "2026-04-09T10:00:00.000Z",
  trackingUrl: "https://portal.igbo.global/applications",
};

describe("application-confirmation template — EN", () => {
  it("includes job title and company in subject", () => {
    const { subject } = render(DATA, "en");
    expect(subject).toContain("Senior Engineer");
    expect(subject).toContain("Igbo Tech");
  });

  it("includes seeker name in HTML body", () => {
    const { html } = render(DATA, "en");
    expect(html).toContain("Ada Obi");
  });

  it("includes job title and company in HTML body", () => {
    const { html } = render(DATA, "en");
    expect(html).toContain("Senior Engineer");
    expect(html).toContain("Igbo Tech");
  });

  it("includes tracking URL in HTML body", () => {
    const { html } = render(DATA, "en");
    expect(html).toContain("https://portal.igbo.global/applications");
  });

  it("includes next-steps guidance in HTML body", () => {
    const { html } = render(DATA, "en");
    expect(html).toContain("The employer will review your application");
  });

  it("includes plain text version", () => {
    const { text } = render(DATA, "en");
    expect(text).toContain("Ada Obi");
    expect(text).toContain("Senior Engineer");
    expect(text).toContain("Igbo Tech");
    expect(text).toContain("https://portal.igbo.global/applications");
  });

  it("HTML-escapes dynamic strings to prevent XSS", () => {
    const { html } = render(
      {
        ...DATA,
        seekerName: '<script>alert("xss")</script>',
        jobTitle: "Job & Title <test>",
        companyName: 'Comp "Name"',
      },
      "en",
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Job &amp; Title");
    expect(html).toContain("&lt;test&gt;");
    expect(html).toContain("Comp &quot;Name&quot;");
  });
});

describe("application-confirmation template — IG", () => {
  it("includes Igbo subject", () => {
    const { subject } = render(DATA, "ig");
    expect(subject).toContain("Arịọ Ezigara");
    expect(subject).toContain("Senior Engineer");
    expect(subject).toContain("Igbo Tech");
  });

  it("includes Igbo greeting in body", () => {
    const { html } = render(DATA, "ig");
    expect(html).toContain("Ndewo Ada Obi");
  });

  it("includes Igbo next-steps guidance", () => {
    const { html } = render(DATA, "ig");
    expect(html).toContain("Onye ọrụ ga-elele arịọ gị");
  });

  it("includes tracking URL in Igbo text body", () => {
    const { text } = render(DATA, "ig");
    expect(text).toContain("https://portal.igbo.global/applications");
  });
});

describe("application-confirmation template — edge cases", () => {
  it("handles missing submittedAt gracefully", () => {
    const { html, text } = render({ ...DATA, submittedAt: undefined }, "en");
    expect(html).toContain("successfully submitted");
    expect(text).toContain("successfully submitted");
  });

  it("wraps in OBIGBO base template", () => {
    const { html } = render(DATA, "en");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("OBIGBO");
  });
});
