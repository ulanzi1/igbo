import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

const APPEAL_EMAIL = "abuse@igbo.global";
const APPEAL_WINDOW = "14 days";

const COPY = {
  en: {
    subject: "Your OBIGBO account has been permanently banned",
    body: (d: Record<string, unknown>) =>
      `<p>Hello ${escHtml(d.name)},</p>
       <p>Your OBIGBO account has been <strong>permanently banned</strong> for violating our Terms of Service.</p>
       <p><strong>Reason:</strong></p>
       <blockquote style="border-left:3px solid #D4631F;padding-left:12px;color:#444;margin:12px 0">${escHtml(d.reason)}</blockquote>
       <p>This ban is permanent and you will no longer be able to access the platform.</p>
       <p><strong>To appeal:</strong> You may submit an appeal within <strong>${APPEAL_WINDOW}</strong> by emailing <a href="mailto:${APPEAL_EMAIL}" style="color:#D4631F">${APPEAL_EMAIL}</a>. Please include your account email address and any relevant information.</p>`,
    text: (d: Record<string, unknown>) =>
      `Hello ${String(d.name)},\n\nYour OBIGBO account has been permanently banned for violating our Terms of Service.\n\nReason: ${String(d.reason)}\n\nThis ban is permanent.\n\nTo appeal: Send an email to ${APPEAL_EMAIL} within ${APPEAL_WINDOW}. Include your account email and any relevant information.`,
  },
  ig: {
    subject: "Emechiri akaụntụ OBIGBO gị ebighị ebi",
    body: (d: Record<string, unknown>) =>
      `<p>Ndewo ${escHtml(d.name)},</p>
       <p>Emechiri akaụntụ OBIGBO gị <strong>ebighị ebi</strong> n'ihi imebi iwu ọrụ anyị.</p>
       <p><strong>Ihe mere:</strong></p>
       <blockquote style="border-left:3px solid #D4631F;padding-left:12px;color:#444;margin:12px 0">${escHtml(d.reason)}</blockquote>
       <p>Imechi a bụ nke ebighị ebi, ị gaghị enwe ike ịbanye na ngwa ọzọ.</p>
       <p><strong>Iji kwuo ụka:</strong> Ị nwere ike iziga ozi imeri na <a href="mailto:${APPEAL_EMAIL}" style="color:#D4631F">${APPEAL_EMAIL}</a> n'ime ụbọchị <strong>${APPEAL_WINDOW}</strong>. Tinye adreesị email akaụntụ gị na ihe ọ bụla dị mkpa.</p>`,
    text: (d: Record<string, unknown>) =>
      `Ndewo ${String(d.name)},\n\nEmechiri akaụntụ OBIGBO gị ebighị ebi n'ihi imebi iwu ọrụ anyị.\n\nIhe mere: ${String(d.reason)}\n\nImechi a bụ nke ebighị ebi.\n\nIji kwuo ụka: Ziga ozi imeri na ${APPEAL_EMAIL} n'ime ụbọchị ${APPEAL_WINDOW}. Tinye adreesị email akaụntụ gị na ihe ọ bụla dị mkpa.`,
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
