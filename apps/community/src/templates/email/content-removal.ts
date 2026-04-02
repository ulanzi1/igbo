import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

const COPY = {
  en: {
    subject: "Your content has been removed from OBIGBO",
    body: (d: Record<string, unknown>) =>
      `<p>Hello ${escHtml(d.name)},</p>
       <p>Our moderation team has reviewed and removed your ${escHtml(d.contentType)} from the OBIGBO platform.</p>
       ${d.contentPreview ? `<p><strong>Removed content preview:</strong></p><blockquote style="border-left:3px solid #999;padding-left:12px;color:#666;margin:12px 0;font-style:italic">${escHtml(d.contentPreview)}</blockquote>` : ""}
       <p><strong>Reason for removal:</strong></p>
       <blockquote style="border-left:3px solid #D4631F;padding-left:12px;color:#444;margin:12px 0">${escHtml(d.reason)}</blockquote>
       <p>Please review our <a href="${escHtml(d.communityGuidelinesUrl)}" style="color:#D4631F">Community Guidelines</a> to ensure future content meets our standards. Repeated violations may result in account suspension.</p>
       <p style="color:#666;font-size:14px">If you believe this removal was made in error, please contact us at support@igbo.global.</p>`,
    text: (d: Record<string, unknown>) =>
      `Hello ${String(d.name)},\n\nOur moderation team has reviewed and removed your ${String(d.contentType)} from OBIGBO.\n\n${d.contentPreview ? `Removed content: ${String(d.contentPreview)}\n\n` : ""}Reason: ${String(d.reason)}\n\nPlease review our Community Guidelines: ${String(d.communityGuidelinesUrl)}\n\nIf you believe this was an error, contact us at support@igbo.global.`,
  },
  ig: {
    subject: "Ewepụrụ ọrụ gị n'OBIGBO",
    body: (d: Record<string, unknown>) =>
      `<p>Ndewo ${escHtml(d.name)},</p>
       <p>Ndị ọrụ nlele OBIGBO enyochara ma wepụ ${escHtml(d.contentType)} gị n'ọnọdụ OBIGBO.</p>
       ${d.contentPreview ? `<p><strong>Ihe a wepụrụ:</strong></p><blockquote style="border-left:3px solid #999;padding-left:12px;color:#666;margin:12px 0;font-style:italic">${escHtml(d.contentPreview)}</blockquote>` : ""}
       <p><strong>Ihe mere iwepụ ya:</strong></p>
       <blockquote style="border-left:3px solid #D4631F;padding-left:12px;color:#444;margin:12px 0">${escHtml(d.reason)}</blockquote>
       <p>Biko lelee <a href="${escHtml(d.communityGuidelinesUrl)}" style="color:#D4631F">Iwu Obodo</a> anyị iji hụ na ọrụ ị ga-eziga n'oge na-abịa ga-dị mma. Ọ bụrụ na ị ga-aga n'ihu imebi iwu, anyị ga-enyochara mkpochapụ akaụntụ gị.</p>
       <p style="color:#666;font-size:14px">Ọ bụrụ na ọ dị njọ, biko kpọtụrụ anyị na support@igbo.global.</p>`,
    text: (d: Record<string, unknown>) =>
      `Ndewo ${String(d.name)},\n\nNdị ọrụ nlele OBIGBO enyochara ma wepụ ${String(d.contentType)} gị n'OBIGBO.\n\n${d.contentPreview ? `Ihe a wepụrụ: ${String(d.contentPreview)}\n\n` : ""}Ihe mere: ${String(d.reason)}\n\nBiko lelee Iwu Obodo anyị: ${String(d.communityGuidelinesUrl)}\n\nỌ bụrụ na ọ dị njọ, biko kpọtụrụ anyị na support@igbo.global.`,
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
