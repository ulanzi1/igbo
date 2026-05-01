import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

// NOTE: This template is intentionally NOT wired into any handler.
// It will be wired via the outbox pattern in Story 6.5 (portal.application.viewed event).
// Template exists here to allow rendering tests and prevent future integration errors.

interface TemplateData {
  seekerName: unknown;
  companyName: unknown;
  jobTitle: unknown;
  applicationUrl: unknown;
}

const COPY = {
  en: {
    subject: (d: TemplateData) =>
      `${String(d.companyName)} viewed your application for ${String(d.jobTitle)}`,
    body: (d: TemplateData) => `<p>Hello ${escHtml(d.seekerName)},</p>
       <p><strong>${escHtml(d.companyName)}</strong> has viewed your application for <strong>${escHtml(d.jobTitle)}</strong>.</p>
       <p>This is a positive sign — keep an eye on your application status for further updates.</p>
       <p><a href="${escHtml(d.applicationUrl)}" style="display:inline-block;background:#D4631F;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">View Your Application</a></p>`,
    text: (d: TemplateData) =>
      `Hello ${String(d.seekerName)},\n\n${String(d.companyName)} viewed your application for ${String(d.jobTitle)}.\n\nView application: ${String(d.applicationUrl)}`,
  },
  ig: {
    subject: (d: TemplateData) =>
      `${String(d.companyName)} hụrụ arịọ gị maka ${String(d.jobTitle)}`,
    body: (d: TemplateData) => `<p>Ndewo ${escHtml(d.seekerName)},</p>
       <p><strong>${escHtml(d.companyName)}</strong> hụrụ arịọ gị maka <strong>${escHtml(d.jobTitle)}</strong>.</p>
       <p>Nke a bụ ihe ọma — nọgide na-enyocha ọnọdụ arịọ gị maka mmepụta ọzọ.</p>
       <p><a href="${escHtml(d.applicationUrl)}" style="display:inline-block;background:#D4631F;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Lee Arịọ Gị</a></p>`,
    text: (d: TemplateData) =>
      `Ndewo ${String(d.seekerName)},\n\n${String(d.companyName)} hụrụ arịọ gị maka ${String(d.jobTitle)}.\n\nLee arịọ: ${String(d.applicationUrl)}`,
  },
} as const;

export function render(data: Record<string, unknown>, locale: "en" | "ig"): EmailTemplateResult {
  const lang = locale === "ig" ? "ig" : "en";
  const c = COPY[lang];
  const d = data as unknown as TemplateData;
  const portalBaseUrl = String(data.portalBaseUrl ?? "");
  const unsubscribeUrl = portalBaseUrl ? `${portalBaseUrl}/settings/notifications` : undefined;
  return {
    subject: c.subject(d),
    html: renderBase(c.body(d), lang, unsubscribeUrl),
    text: c.text(d),
  };
}
