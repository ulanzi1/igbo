import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

const COPY = {
  en: {
    subject: "Your OBIGBO account suspension has been lifted",
    body: (d: Record<string, unknown>) =>
      `<p>Hello ${escHtml(d.name)},</p>
       <p>Your OBIGBO account suspension has been <strong>lifted early</strong> by our moderation team.</p>
       <p><strong>Reason:</strong></p>
       <blockquote style="border-left:3px solid #2E7D32;padding-left:12px;color:#444;margin:12px 0">${escHtml(d.reason)}</blockquote>
       <p>You can now access the platform again. We encourage you to review our community guidelines to avoid future issues.</p>
       <p style="color:#666;font-size:14px">If you have any questions, please contact us at support@igbo.global.</p>`,
    text: (d: Record<string, unknown>) =>
      `Hello ${String(d.name)},\n\nYour OBIGBO account suspension has been lifted early.\n\nReason: ${String(d.reason)}\n\nYou can now access the platform again.\n\nIf you have any questions, contact us at support@igbo.global.`,
  },
  ig: {
    subject: "Emepela imechi akaụntụ OBIGBO gị",
    body: (d: Record<string, unknown>) =>
      `<p>Ndewo ${escHtml(d.name)},</p>
       <p>Ndị ọrụ nlele OBIGBO <strong>emepelara</strong> imechi akaụntụ gị oge ntụ.</p>
       <p><strong>Ihe mere:</strong></p>
       <blockquote style="border-left:3px solid #2E7D32;padding-left:12px;color:#444;margin:12px 0">${escHtml(d.reason)}</blockquote>
       <p>Ugbu a ị nwere ike ịbanye na ngwa ọzọ. Anyị na-agba gị ume ka ị lelee iwu obodo anyị iji zere nsogbu n'ọdịnihu.</p>
       <p style="color:#666;font-size:14px">Ọ bụrụ na ị nwere ajụjụ, biko kpọtụrụ anyị na support@igbo.global.</p>`,
    text: (d: Record<string, unknown>) =>
      `Ndewo ${String(d.name)},\n\nEmepelara imechi akaụntụ OBIGBO gị oge ntụ.\n\nIhe mere: ${String(d.reason)}\n\nUgbu a ị nwere ike ịbanye na ngwa ọzọ.\n\nỌ bụrụ na ị nwere ajụjụ, biko kpọtụrụ anyị na support@igbo.global.`,
  },
} as const;

export function render(data: Record<string, unknown>, locale: "en" | "ig"): EmailTemplateResult {
  const lang = locale === "ig" ? "ig" : "en";
  const c = COPY[lang];
  return {
    subject: c.subject,
    html: renderBase(c.body(data), lang),
    text: c.text(data),
  };
}
