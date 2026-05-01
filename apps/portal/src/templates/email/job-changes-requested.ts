import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

interface TemplateData {
  jobTitle: unknown;
  companyName: unknown;
  jobEditUrl: unknown;
}

const COPY = {
  en: {
    subject: (d: TemplateData) => `Changes requested for ${String(d.jobTitle)}`,
    body: (d: TemplateData) => `<p>Hello ${escHtml(d.companyName)},</p>
       <p>Our review team has requested changes to your job posting <strong>${escHtml(d.jobTitle)}</strong> before it can be approved.</p>
       <p>Please review the feedback, update your posting accordingly, and resubmit it for review.</p>
       <p><a href="${escHtml(d.jobEditUrl)}" style="display:inline-block;background:#D4631F;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Edit Job Posting</a></p>`,
    text: (d: TemplateData) =>
      `Hello ${String(d.companyName)},\n\nChanges have been requested for your job posting "${String(d.jobTitle)}".\n\nPlease update and resubmit: ${String(d.jobEditUrl)}`,
  },
  ig: {
    subject: (d: TemplateData) => `A chọrọ mgbanwe maka ${String(d.jobTitle)}`,
    body: (d: TemplateData) => `<p>Ndewo ${escHtml(d.companyName)},</p>
       <p>Ndị otu nyocha anyị arịọla mgbanwe maka ntinye ọrụ gị <strong>${escHtml(d.jobTitle)}</strong> tupu anyị nwere ike ikwenyere ya.</p>
       <p>Biko lelee nkọwa, melite ntinye gị, ma zipu ya ọzọ maka nyocha.</p>
       <p><a href="${escHtml(d.jobEditUrl)}" style="display:inline-block;background:#D4631F;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Dezie Ntinye Ọrụ</a></p>`,
    text: (d: TemplateData) =>
      `Ndewo ${String(d.companyName)},\n\nA chọrọ mgbanwe maka ntinye ọrụ gị "${String(d.jobTitle)}".\n\nBiko melite ma zipu ọzọ: ${String(d.jobEditUrl)}`,
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
