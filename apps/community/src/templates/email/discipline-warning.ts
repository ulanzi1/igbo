import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

const COPY = {
  en: {
    subject: "Important: A warning has been issued on your OBIGBO account",
    body: (d: Record<string, unknown>) =>
      `<p>Hello ${escHtml(d.name)},</p>
       <p>Your OBIGBO account has received a formal warning from our moderation team.</p>
       <p><strong>Reason:</strong></p>
       <blockquote style="border-left:3px solid #D4631F;padding-left:12px;color:#444;margin:12px 0">${escHtml(d.reason)}</blockquote>
       <p>Please review our <a href="${escHtml(d.communityGuidelinesUrl)}" style="color:#D4631F">Community Guidelines</a> to avoid further action. Repeated violations may result in suspension or a permanent ban.</p>
       <p style="color:#666;font-size:14px">If you believe this warning was issued in error, please contact us at support@igbo.global.</p>`,
    text: (d: Record<string, unknown>) =>
      `Hello ${String(d.name)},\n\nYour OBIGBO account has received a formal warning from our moderation team.\n\nReason: ${String(d.reason)}\n\nPlease review our Community Guidelines: ${String(d.communityGuidelinesUrl)}\n\nRepeated violations may result in suspension or a permanent ban.\n\nIf you believe this warning was issued in error, please contact us at support@igbo.global.`,
  },
  ig: {
    subject: "Nkọwa: Ọnọdụ ọjọọ nyere aka na akaụntụ OBIGBO gị",
    body: (d: Record<string, unknown>) =>
      `<p>Ndewo ${escHtml(d.name)},</p>
       <p>Ndị ọrụ nlele OBIGBO nyere akaụntụ gị ọnọdụ ọjọọ ọ bụ nke mbụ.</p>
       <p><strong>Ihe mere:</strong></p>
       <blockquote style="border-left:3px solid #D4631F;padding-left:12px;color:#444;margin:12px 0">${escHtml(d.reason)}</blockquote>
       <p>Biko lelee <a href="${escHtml(d.communityGuidelinesUrl)}" style="color:#D4631F">Iwu Obodo</a> anyị iji zere mmejọ ọzọ. Ọ bụrụ na ị ga-aga n'ihu imebi iwu, anyị ga-enyochara mkpochapụ ma ọ bụ nchụpụ dị na ebighị ebi.</p>
       <p style="color:#666;font-size:14px">Ọ bụrụ na ị chere na ọnọdụ ọjọọ a ezigaghị onye ọ bụla, biko kpọtụrụ anyị na support@igbo.global.</p>`,
    text: (d: Record<string, unknown>) =>
      `Ndewo ${String(d.name)},\n\nNdị ọrụ nlele OBIGBO nyere akaụntụ gị ọnọdụ ọjọọ.\n\nIhe mere: ${String(d.reason)}\n\nBiko lelee Iwu Obodo anyị: ${String(d.communityGuidelinesUrl)}\n\nỌ bụrụ na ị ga-aga n'ihu imebi iwu, anyị ga-enyochara mkpochapụ ma ọ bụ nchụpụ.\n\nỌ bụrụ na ọ dị njọ, biko kpọtụrụ anyị na support@igbo.global.`,
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
