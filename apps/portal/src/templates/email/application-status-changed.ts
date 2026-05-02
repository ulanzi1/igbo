import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

interface TemplateData {
  seekerName: unknown;
  jobTitle: unknown;
  newStatus: unknown;
  companyName: unknown;
  applicationUrl: unknown;
}

const COPY = {
  en: {
    subject: (d: TemplateData) => `Update on your application for ${String(d.jobTitle)}`,
    body: (d: TemplateData) => `<p>Hello ${escHtml(d.seekerName)},</p>
       <p>Your application for <strong>${escHtml(d.jobTitle)}</strong> at <strong>${escHtml(d.companyName)}</strong> has been updated.</p>
       <p><strong>New status:</strong> ${escHtml(d.newStatus)}</p>
       <p>Log in to your portal to see the full details and any next steps.</p>
       <p><a href="${escHtml(d.applicationUrl)}" style="display:inline-block;background:#D4631F;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">View Application</a></p>`,
    text: (d: TemplateData) =>
      `Hello ${String(d.seekerName)},\n\nYour application for ${String(d.jobTitle)} at ${String(d.companyName)} has been updated.\n\nNew status: ${String(d.newStatus)}\n\nView application: ${String(d.applicationUrl)}`,
  },
  ig: {
    subject: (d: TemplateData) => `Mmepụta maka arịọ gị maka ${String(d.jobTitle)}`,
    body: (d: TemplateData) => `<p>Ndewo ${escHtml(d.seekerName)},</p>
       <p>Arịọ gị maka <strong>${escHtml(d.jobTitle)}</strong> na <strong>${escHtml(d.companyName)}</strong> agbanweela.</p>
       <p><strong>Ọnọdụ ọhụrụ:</strong> ${escHtml(d.newStatus)}</p>
       <p>Banye n'ọnụ ọgụgụ gị iji hụ nkọwa zuru oke na usoro ọzọ.</p>
       <p><a href="${escHtml(d.applicationUrl)}" style="display:inline-block;background:#D4631F;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Lee Arịọ</a></p>`,
    text: (d: TemplateData) =>
      `Ndewo ${String(d.seekerName)},\n\nArịọ gị maka ${String(d.jobTitle)} na ${String(d.companyName)} agbanweela.\n\nỌnọdụ ọhụrụ: ${String(d.newStatus)}\n\nLee arịọ: ${String(d.applicationUrl)}`,
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
