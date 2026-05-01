import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

interface TemplateData {
  jobTitle: unknown;
  companyName: unknown;
  jobDetailUrl: unknown;
}

const COPY = {
  en: {
    subject: (d: TemplateData) => `Your job posting ${String(d.jobTitle)} is now live`,
    body: (d: TemplateData) => `<p>Hello ${escHtml(d.companyName)},</p>
       <p>Great news! Your job posting <strong>${escHtml(d.jobTitle)}</strong> has been approved and is now live on the OBIGBO Job Portal.</p>
       <p>Seekers can now discover and apply for this role. You'll be notified when applications arrive.</p>
       <p><a href="${escHtml(d.jobDetailUrl)}" style="display:inline-block;background:#D4631F;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">View Job Posting</a></p>`,
    text: (d: TemplateData) =>
      `Hello ${String(d.companyName)},\n\nYour job posting "${String(d.jobTitle)}" has been approved and is now live.\n\nView posting: ${String(d.jobDetailUrl)}`,
  },
  ig: {
    subject: (d: TemplateData) => `Ọrụ gị ${String(d.jobTitle)} dị ugbu a`,
    body: (d: TemplateData) => `<p>Ndewo ${escHtml(d.companyName)},</p>
       <p>Ozi ọma! Ntinye ọrụ gị <strong>${escHtml(d.jobTitle)}</strong> nọkwuola ma dị ugbu a na OBIGBO Job Portal.</p>
       <p>Ndị na-achọ ọrụ nwere ike ịchọta ma tinye arịọ maka ọrụ a ugbu a. A ga-ịkọ gị mgbe arịọ a bịa.</p>
       <p><a href="${escHtml(d.jobDetailUrl)}" style="display:inline-block;background:#D4631F;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Lee Ntinye Ọrụ</a></p>`,
    text: (d: TemplateData) =>
      `Ndewo ${String(d.companyName)},\n\nNtinye ọrụ gị "${String(d.jobTitle)}" nọkwuola ma dị ugbu a.\n\nLee ntinye: ${String(d.jobDetailUrl)}`,
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
