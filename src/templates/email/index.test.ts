// @vitest-environment node
import { describe, it, expect } from "vitest";
import { renderTemplate } from "./index";

// Minimal valid data for each template
const minData: Record<string, Record<string, unknown>> = {
  "email-verification": { name: "Chima", verifyUrl: "https://example.com/verify" },
  "application-received": { name: "Chima" },
  "welcome-approved": {
    name: "Chima",
    setPasswordUrl: "https://example.com/set-password?token=abc",
  },
  "request-info": { name: "Chima", message: "Please provide more details." },
  "rejection-notice": { name: "Chima" },
  "member-welcome": {
    name: "Chima",
    dashboardUrl: "https://example.com/dashboard",
    groupsUrl: "https://example.com/groups",
    membersUrl: "https://example.com/members",
  },
  "account-lockout": { name: "Chima", ip: "1.2.3.4", lockoutMinutes: 15 },
  "email-otp": { name: "Chima", otp: "123456" },
  "password-reset": { name: "Chima", resetUrl: "https://example.com/reset" },
  "password-reset-confirmation": { name: "Chima" },
  "session-evicted": { name: "Chima" },
  "2fa-reset-complete": { name: "Chima" },
  "gdpr-account-deletion": {
    name: "Chima",
    scheduledDeletionAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    cancellationToken: "token123",
    cancellationUrl: "https://example.com/cancel",
  },
  "gdpr-export-ready": {
    name: "Chima",
    downloadToken: "dltoken123",
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    downloadUrl: "https://example.com/download",
  },
  "gdpr-breach-notification": {
    name: "Chima",
    incidentTimestamp: "2026-02-26T00:00:00Z",
    notificationMessage: "We detected unusual activity.",
  },
  "article-published": {
    name: "Chima",
    title: "My First Article",
    articleUrl: "https://example.com/articles/my-first-article",
  },
  "article-rejected": {
    name: "Chima",
    title: "My First Article",
    editUrl: "https://example.com/articles/article-uuid/edit",
    feedback: "Please add more cultural context.",
  },
  "article-revision-requested": {
    name: "Chima",
    title: "My First Article",
    editUrl: "https://example.com/articles/article-uuid/edit",
    feedback: "Please expand the introduction section.",
  },
};

const ALL_TEMPLATE_IDS = Object.keys(minData);

describe("renderTemplate registry", () => {
  it("has all 18 templates registered", () => {
    expect(ALL_TEMPLATE_IDS).toHaveLength(18);
  });

  it.each(ALL_TEMPLATE_IDS)("template '%s' renders without throwing (en)", (id) => {
    expect(() => renderTemplate(id, minData[id]!, "en")).not.toThrow();
  });

  it.each(ALL_TEMPLATE_IDS)("template '%s' renders without throwing (ig)", (id) => {
    expect(() => renderTemplate(id, minData[id]!, "ig")).not.toThrow();
  });

  it.each(ALL_TEMPLATE_IDS)("template '%s' returns { subject, html, text }", (id) => {
    const result = renderTemplate(id, minData[id]!, "en");
    expect(result).toHaveProperty("subject");
    expect(result).toHaveProperty("html");
    expect(result).toHaveProperty("text");
    expect(typeof result.subject).toBe("string");
    expect(typeof result.html).toBe("string");
    expect(typeof result.text).toBe("string");
  });

  it("throws for unknown template id", () => {
    expect(() => renderTemplate("unknown-id", {}, "en")).toThrow(
      "Unknown email template: unknown-id",
    );
  });

  it("email-verification contains name in html", () => {
    const result = renderTemplate(
      "email-verification",
      { name: "Chima", verifyUrl: "https://t.co" },
      "en",
    );
    expect(result.html).toContain("Chima");
  });

  it("Igbo locale returns different subject than English", () => {
    const en = renderTemplate("email-verification", minData["email-verification"]!, "en");
    const ig = renderTemplate("email-verification", minData["email-verification"]!, "ig");
    expect(en.subject).not.toBe(ig.subject);
  });

  it("HTML output contains OBIGBO branding", () => {
    const result = renderTemplate("email-verification", minData["email-verification"]!, "en");
    expect(result.html).toContain("OBIGBO");
  });

  it("defaults locale to 'en' when not provided", () => {
    const defaultResult = renderTemplate("email-verification", minData["email-verification"]!);
    const enResult = renderTemplate("email-verification", minData["email-verification"]!, "en");
    expect(defaultResult.subject).toBe(enResult.subject);
  });

  it("escapes XSS in name for email-verification", () => {
    const result = renderTemplate(
      "email-verification",
      { name: '<script>alert("xss")</script>', verifyUrl: "https://t.co" },
      "en",
    );
    expect(result.html).not.toContain("<script>");
    expect(result.html).toContain("&lt;script&gt;");
  });

  it("escapes XSS in message for request-info", () => {
    const result = renderTemplate(
      "request-info",
      { name: "Chima", message: '<img src=x onerror="alert(1)">' },
      "en",
    );
    expect(result.html).not.toContain("<img");
    expect(result.html).toContain("&lt;img");
  });

  it("email-otp defaults expiresMinutes to 10 when absent", () => {
    const result = renderTemplate("email-otp", { name: "Chima", otp: "999999" }, "en");
    expect(result.html).toContain("10");
    expect(result.text).toContain("10");
  });
});
