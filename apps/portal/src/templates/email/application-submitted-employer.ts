import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

interface TemplateData {
  jobTitle: unknown;
  seekerName: unknown;
  companyName: unknown;
  applicationDetailUrl: unknown;
}

const COPY = {
  en: {
    subject: (d: TemplateData) => `New application for ${String(d.jobTitle)}`,
    body: (d: TemplateData) => `<p>Hello ${escHtml(d.companyName)},</p>
       <p>A new application has been submitted for <strong>${escHtml(d.jobTitle)}</strong> at your company.</p>
       <p><strong>Applicant:</strong> ${escHtml(d.seekerName)}</p>
       <p>Review the application and take action on the candidate's profile.</p>
       <p><a href="${escHtml(d.applicationDetailUrl)}" style="display:inline-block;background:#D4631F;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">View Application</a></p>`,
    text: (d: TemplateData) =>
      `Hello ${String(d.companyName)},\n\nA new application has been submitted for ${String(d.jobTitle)} at your company.\n\nApplicant: ${String(d.seekerName)}\n\nView application: ${String(d.applicationDetailUrl)}`,
  },
  ig: {
    subject: (d: TemplateData) => `Arịọ ọhụrụ maka ${String(d.jobTitle)}`,
    body: (d: TemplateData) => `<p>Ndewo ${escHtml(d.companyName)},</p>
       <p>Arịọ ọhụrụ ezigara maka <strong>${escHtml(d.jobTitle)}</strong> n'ụlọ ọrụ gị.</p>
       <p><strong>Onye na-arịọ:</strong> ${escHtml(d.seekerName)}</p>
       <p>Lelee arịọ ahụ ma mee ihe ọ bụla n'ebe onye ọrụ nọ.</p>
       <p><a href="${escHtml(d.applicationDetailUrl)}" style="display:inline-block;background:#D4631F;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Lee Arịọ</a></p>`,
    text: (d: TemplateData) =>
      `Ndewo ${String(d.companyName)},\n\nArịọ ọhụrụ ezigara maka ${String(d.jobTitle)} n'ụlọ ọrụ gị.\n\nOnye na-arịọ: ${String(d.seekerName)}\n\nLee arịọ: ${String(d.applicationDetailUrl)}`,
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
