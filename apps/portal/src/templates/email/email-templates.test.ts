import { describe, it, expect } from "vitest";
import { render as renderApplicationSubmittedEmployer } from "./application-submitted-employer";
import { render as renderApplicationStatusChanged } from "./application-status-changed";
import { render as renderJobApproved } from "./job-approved";
import { render as renderJobRejected } from "./job-rejected";
import { render as renderJobChangesRequested } from "./job-changes-requested";
import { render as renderJobExpired } from "./job-expired";
import { render as renderApplicationViewed } from "./application-viewed";

// ── application-submitted-employer ────────────────────────────────────────────

describe("application-submitted-employer template", () => {
  const data = {
    jobTitle: "Software Engineer",
    seekerName: "Ada Okonkwo",
    companyName: "Igbo Tech Ltd",
    applicationDetailUrl: "https://portal.igbo.global/admin/applications/app-123",
    portalBaseUrl: "https://portal.igbo.global",
  };

  it("renders in English with correct subject interpolating job title", () => {
    const result = renderApplicationSubmittedEmployer(data, "en");
    expect(result.subject).toBe("New application for Software Engineer");
    expect(result.subject).toContain("Software Engineer");
  });

  it("renders in Igbo with subject that differs from English", () => {
    const result = renderApplicationSubmittedEmployer(data, "ig");
    const enResult = renderApplicationSubmittedEmployer(data, "en");
    expect(result.subject).not.toBe(enResult.subject);
    expect(result.subject).toContain("Software Engineer");
  });

  it("HTML includes CTA button with correct href", () => {
    const result = renderApplicationSubmittedEmployer(data, "en");
    expect(result.html).toContain("https://portal.igbo.global/admin/applications/app-123");
    expect(result.html).toContain("View Application");
  });

  it("HTML-escapes user-provided content", () => {
    const xssData = { ...data, jobTitle: "<script>alert('xss')</script>" };
    const result = renderApplicationSubmittedEmployer(xssData, "en");
    expect(result.html).not.toContain("<script>");
    expect(result.html).toContain("&lt;script&gt;");
  });

  it("plain-text fallback is non-empty and includes key info", () => {
    const result = renderApplicationSubmittedEmployer(data, "en");
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.text).toContain("Software Engineer");
    expect(result.text).toContain("Ada Okonkwo");
  });

  it("renders without throwing when optional fields are missing", () => {
    const minimal = {
      jobTitle: "Engineer",
      seekerName: "Someone",
      companyName: "Acme",
      applicationDetailUrl: "https://example.com",
    };
    expect(() => renderApplicationSubmittedEmployer(minimal, "en")).not.toThrow();
  });

  it("subject interpolates dynamic job title correctly", () => {
    const custom = { ...data, jobTitle: "Data Scientist" };
    const result = renderApplicationSubmittedEmployer(custom, "en");
    expect(result.subject).toContain("Data Scientist");
    expect(result.subject).not.toContain("Software Engineer");
  });

  it("unsubscribe link points to /settings/notifications when portalBaseUrl provided", () => {
    const result = renderApplicationSubmittedEmployer(data, "en");
    expect(result.html).toContain("/settings/notifications");
  });
});

// ── application-status-changed ────────────────────────────────────────────────

describe("application-status-changed template", () => {
  const data = {
    seekerName: "Ada Okonkwo",
    jobTitle: "Backend Developer",
    newStatus: "shortlisted",
    companyName: "Igbo Tech Ltd",
    applicationUrl: "https://portal.igbo.global/applications/app-123",
    portalBaseUrl: "https://portal.igbo.global",
  };

  it("renders in English with correct subject interpolating job title", () => {
    const result = renderApplicationStatusChanged(data, "en");
    expect(result.subject).toBe("Update on your application for Backend Developer");
    expect(result.subject).toContain("Backend Developer");
  });

  it("renders in Igbo with subject that differs from English", () => {
    const result = renderApplicationStatusChanged(data, "ig");
    const enResult = renderApplicationStatusChanged(data, "en");
    expect(result.subject).not.toBe(enResult.subject);
    expect(result.subject).toContain("Backend Developer");
  });

  it("HTML includes CTA button with correct href", () => {
    const result = renderApplicationStatusChanged(data, "en");
    expect(result.html).toContain("https://portal.igbo.global/applications/app-123");
    expect(result.html).toContain("View Application");
  });

  it("HTML-escapes user-provided content", () => {
    const xssData = { ...data, seekerName: '<img src=x onerror="alert(1)">' };
    const result = renderApplicationStatusChanged(xssData, "en");
    // The raw <img tag must be escaped — attacker cannot inject executable HTML
    expect(result.html).not.toContain("<img");
    expect(result.html).toContain("&lt;img");
  });

  it("plain-text fallback includes new status and application URL", () => {
    const result = renderApplicationStatusChanged(data, "en");
    expect(result.text).toContain("shortlisted");
    expect(result.text).toContain("https://portal.igbo.global/applications/app-123");
  });

  it("renders without throwing when all fields provided", () => {
    expect(() => renderApplicationStatusChanged(data, "en")).not.toThrow();
  });

  it("subject includes dynamic job title", () => {
    const custom = { ...data, jobTitle: "Product Manager" };
    const result = renderApplicationStatusChanged(custom, "en");
    expect(result.subject).toContain("Product Manager");
  });
});

// ── job-approved ──────────────────────────────────────────────────────────────

describe("job-approved template", () => {
  const data = {
    jobTitle: "iOS Developer",
    companyName: "Nkem Solutions",
    jobDetailUrl: "https://portal.igbo.global/jobs/job-456",
    portalBaseUrl: "https://portal.igbo.global",
  };

  it("renders in English with correct subject interpolating job title", () => {
    const result = renderJobApproved(data, "en");
    expect(result.subject).toBe("Your job posting iOS Developer is now live");
    expect(result.subject).toContain("iOS Developer");
  });

  it("renders in Igbo with subject that differs from English", () => {
    const result = renderJobApproved(data, "ig");
    const enResult = renderJobApproved(data, "en");
    expect(result.subject).not.toBe(enResult.subject);
    expect(result.subject).toContain("iOS Developer");
  });

  it("HTML includes CTA button with correct href", () => {
    const result = renderJobApproved(data, "en");
    expect(result.html).toContain("https://portal.igbo.global/jobs/job-456");
    expect(result.html).toContain("View Job Posting");
  });

  it("HTML-escapes user-provided content", () => {
    const xssData = { ...data, jobTitle: "<b onmouseover=alert('xss')>hover</b>" };
    const result = renderJobApproved(xssData, "en");
    // The raw <b tag must be escaped — attacker cannot inject executable HTML
    expect(result.html).not.toContain("<b ");
    expect(result.html).toContain("&lt;b");
  });

  it("plain-text fallback includes job title and URL", () => {
    const result = renderJobApproved(data, "en");
    expect(result.text).toContain("iOS Developer");
    expect(result.text).toContain("https://portal.igbo.global/jobs/job-456");
  });

  it("renders without throwing", () => {
    expect(() => renderJobApproved(data, "en")).not.toThrow();
  });

  it("subject interpolates dynamic job title", () => {
    const custom = { ...data, jobTitle: "React Engineer" };
    const result = renderJobApproved(custom, "en");
    expect(result.subject).toContain("React Engineer");
  });
});

// ── job-rejected ──────────────────────────────────────────────────────────────

describe("job-rejected template", () => {
  const data = {
    jobTitle: "QA Engineer",
    companyName: "Chike Ventures",
    portalBaseUrl: "https://portal.igbo.global",
  };

  it("renders in English with correct subject interpolating job title", () => {
    const result = renderJobRejected(data, "en");
    expect(result.subject).toBe("Your job posting QA Engineer was not approved");
    expect(result.subject).toContain("QA Engineer");
  });

  it("renders in Igbo with subject that differs from English", () => {
    const result = renderJobRejected(data, "ig");
    const enResult = renderJobRejected(data, "en");
    expect(result.subject).not.toBe(enResult.subject);
    expect(result.subject).toContain("QA Engineer");
  });

  it("HTML does NOT include a CTA button (no action available for rejected)", () => {
    const result = renderJobRejected(data, "en");
    // The OBIGBO header uses background:#D4631F, but the CTA button uses display:inline-block + background
    // Absence of the inline-block style confirms no CTA button is present
    expect(result.html).not.toContain("display:inline-block;background:#D4631F");
  });

  it("HTML-escapes user-provided content", () => {
    const xssData = { ...data, jobTitle: "<script>bad()</script>" };
    const result = renderJobRejected(xssData, "en");
    expect(result.html).not.toContain("<script>");
    expect(result.html).toContain("&lt;script&gt;");
  });

  it("plain-text fallback is non-empty and includes job title", () => {
    const result = renderJobRejected(data, "en");
    expect(result.text).toContain("QA Engineer");
    expect(result.text.length).toBeGreaterThan(0);
  });

  it("handles missing optional reason field without throwing", () => {
    expect(() => renderJobRejected(data, "en")).not.toThrow();
    const result = renderJobRejected(data, "en");
    // No "Reason:" label when no reason provided
    expect(result.html).not.toContain("<strong>Reason:</strong>");
  });

  it("includes reason in body when provided", () => {
    const withReason = { ...data, reason: "Missing salary information" };
    const result = renderJobRejected(withReason, "en");
    expect(result.html).toContain("Missing salary information");
  });
});

// ── job-changes-requested ─────────────────────────────────────────────────────

describe("job-changes-requested template", () => {
  const data = {
    jobTitle: "DevOps Engineer",
    companyName: "Ngozi Corp",
    jobEditUrl: "https://portal.igbo.global/jobs/job-789/edit",
    portalBaseUrl: "https://portal.igbo.global",
  };

  it("renders in English with correct subject interpolating job title", () => {
    const result = renderJobChangesRequested(data, "en");
    expect(result.subject).toBe("Changes requested for DevOps Engineer");
    expect(result.subject).toContain("DevOps Engineer");
  });

  it("renders in Igbo with subject that differs from English", () => {
    const result = renderJobChangesRequested(data, "ig");
    const enResult = renderJobChangesRequested(data, "en");
    expect(result.subject).not.toBe(enResult.subject);
    expect(result.subject).toContain("DevOps Engineer");
  });

  it("HTML includes CTA button with correct href", () => {
    const result = renderJobChangesRequested(data, "en");
    expect(result.html).toContain("https://portal.igbo.global/jobs/job-789/edit");
    expect(result.html).toContain("Edit Job Posting");
  });

  it("HTML-escapes user-provided content", () => {
    const xssData = { ...data, companyName: '<a href="evil.com">Click me</a>' };
    const result = renderJobChangesRequested(xssData, "en");
    expect(result.html).not.toContain('href="evil.com"');
    expect(result.html).toContain("&lt;a");
  });

  it("plain-text fallback includes job title and edit URL", () => {
    const result = renderJobChangesRequested(data, "en");
    expect(result.text).toContain("DevOps Engineer");
    expect(result.text).toContain("https://portal.igbo.global/jobs/job-789/edit");
  });

  it("renders without throwing", () => {
    expect(() => renderJobChangesRequested(data, "en")).not.toThrow();
  });

  it("subject interpolates dynamic job title", () => {
    const custom = { ...data, jobTitle: "Systems Architect" };
    const result = renderJobChangesRequested(custom, "en");
    expect(result.subject).toContain("Systems Architect");
  });
});

// ── job-expired ───────────────────────────────────────────────────────────────

describe("job-expired template", () => {
  const data = {
    jobTitle: "UX Designer",
    companyName: "Obi Creatives",
    renewUrl: "https://portal.igbo.global/jobs/new",
    portalBaseUrl: "https://portal.igbo.global",
  };

  it("renders in English with correct subject interpolating job title", () => {
    const result = renderJobExpired(data, "en");
    expect(result.subject).toBe("UX Designer has expired");
    expect(result.subject).toContain("UX Designer");
  });

  it("renders in Igbo with subject that differs from English", () => {
    const result = renderJobExpired(data, "ig");
    const enResult = renderJobExpired(data, "en");
    expect(result.subject).not.toBe(enResult.subject);
    expect(result.subject).toContain("UX Designer");
  });

  it("HTML includes CTA button with correct href", () => {
    const result = renderJobExpired(data, "en");
    expect(result.html).toContain("https://portal.igbo.global/jobs/new");
    expect(result.html).toContain("Renew or Create New Posting");
  });

  it("HTML-escapes user-provided content", () => {
    const xssData = { ...data, companyName: '"><script>pwn()</script><"' };
    const result = renderJobExpired(xssData, "en");
    expect(result.html).not.toContain("<script>");
  });

  it("plain-text fallback includes job title and renew URL", () => {
    const result = renderJobExpired(data, "en");
    expect(result.text).toContain("UX Designer");
    expect(result.text).toContain("https://portal.igbo.global/jobs/new");
  });

  it("renders without throwing", () => {
    expect(() => renderJobExpired(data, "en")).not.toThrow();
  });

  it("subject starts with job title (no static prefix)", () => {
    const result = renderJobExpired(data, "en");
    expect(result.subject).toMatch(/^UX Designer/);
  });
});

// ── application-viewed ────────────────────────────────────────────────────────

describe("application-viewed template", () => {
  const data = {
    seekerName: "Emeka Eze",
    companyName: "Chinwe & Co",
    jobTitle: "Sales Manager",
    applicationUrl: "https://portal.igbo.global/applications/app-999",
    portalBaseUrl: "https://portal.igbo.global",
  };

  it("renders in English without throwing (existence/smoke test)", () => {
    expect(() => renderApplicationViewed(data, "en")).not.toThrow();
    const result = renderApplicationViewed(data, "en");
    expect(result.subject).toContain("Sales Manager");
    expect(result.html.length).toBeGreaterThan(0);
    expect(result.text.length).toBeGreaterThan(0);
  });

  it("renders in Igbo with subject that differs from English", () => {
    const result = renderApplicationViewed(data, "ig");
    const enResult = renderApplicationViewed(data, "en");
    expect(result.subject).not.toBe(enResult.subject);
  });

  it("HTML includes CTA button with correct href", () => {
    const result = renderApplicationViewed(data, "en");
    expect(result.html).toContain("https://portal.igbo.global/applications/app-999");
    expect(result.html).toContain("View Your Application");
  });

  it("HTML-escapes user-provided content", () => {
    const xssData = { ...data, companyName: "<script>bad()</script>" };
    const result = renderApplicationViewed(xssData, "en");
    expect(result.html).not.toContain("<script>");
    expect(result.html).toContain("&lt;script&gt;");
  });

  it("plain-text fallback includes company name, job title, and URL", () => {
    const result = renderApplicationViewed(data, "en");
    expect(result.text).toContain("Chinwe & Co");
    expect(result.text).toContain("Sales Manager");
    expect(result.text).toContain("https://portal.igbo.global/applications/app-999");
  });

  it("subject interpolates both company name and job title", () => {
    const result = renderApplicationViewed(data, "en");
    expect(result.subject).toContain("Chinwe & Co");
    expect(result.subject).toContain("Sales Manager");
  });
});
