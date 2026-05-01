import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

interface TemplateData {
  jobTitle: unknown;
  companyName: unknown;
  renewUrl: unknown;
}

const COPY = {
  en: {
    subject: (d: TemplateData) => `${String(d.jobTitle)} has expired`,
    body: (d: TemplateData) => `<p>Hello ${escHtml(d.companyName)},</p>
       <p>Your job posting <strong>${escHtml(d.jobTitle)}</strong> has expired and is no longer accepting applications.</p>
       <p>If you'd like to continue attracting candidates, you can renew this posting or create a new one.</p>
       <p><a href="${escHtml(d.renewUrl)}" style="display:inline-block;background:#D4631F;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Renew or Create New Posting</a></p>`,
    text: (d: TemplateData) =>
      `Hello ${String(d.companyName)},\n\nYour job posting "${String(d.jobTitle)}" has expired and is no longer accepting applications.\n\nRenew or create new: ${String(d.renewUrl)}`,
  },
  ig: {
    subject: (d: TemplateData) => `${String(d.jobTitle)} agwụla`,
    body: (d: TemplateData) => `<p>Ndewo ${escHtml(d.companyName)},</p>
       <p>Ntinye ọrụ gị <strong>${escHtml(d.jobTitle)}</strong> agwụla ma ọ naghị anabata arịọ ọzọ.</p>
       <p>Ọ bụrụ na ị chọọ ịga n'ihu ịdọta ndị ọrụ, ị nwere ike ịkwado ntinye a ma ọ bụ mepụta ọhụrụ.</p>
       <p><a href="${escHtml(d.renewUrl)}" style="display:inline-block;background:#D4631F;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Kwado ma ọ bụ Mepụta Ntinye Ọhụrụ</a></p>`,
    text: (d: TemplateData) =>
      `Ndewo ${String(d.companyName)},\n\nNtinye ọrụ gị "${String(d.jobTitle)}" agwụla ma ọ naghị anabata arịọ ọzọ.\n\nKwado ma ọ bụ mepụta ọhụrụ: ${String(d.renewUrl)}`,
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
