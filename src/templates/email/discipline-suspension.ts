import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

const COPY = {
  en: {
    subject: "Your OBIGBO account has been suspended",
    body: (d: Record<string, unknown>) =>
      `<p>Hello ${escHtml(d.name)},</p>
       <p>Your OBIGBO account has been <strong>suspended</strong> by our moderation team.</p>
       <p><strong>Reason:</strong></p>
       <blockquote style="border-left:3px solid #D4631F;padding-left:12px;color:#444;margin:12px 0">${escHtml(d.reason)}</blockquote>
       <p><strong>Duration:</strong> ${escHtml(d.duration)}</p>
       ${d.endsAt ? `<p><strong>Suspension ends:</strong> ${escHtml(d.endsAt)}</p>` : ""}
       <p>During suspension you will not be able to access the platform. Your account will be automatically restored when the suspension period ends.</p>
       <p style="color:#666;font-size:14px">If you believe this suspension was issued in error, please contact us at support@igbo.global.</p>`,
    text: (d: Record<string, unknown>) =>
      `Hello ${String(d.name)},\n\nYour OBIGBO account has been suspended.\n\nReason: ${String(d.reason)}\nDuration: ${String(d.duration)}${d.endsAt ? `\nSuspension ends: ${String(d.endsAt)}` : ""}\n\nYour account will be restored automatically when the suspension ends.\n\nIf you believe this was an error, contact us at support@igbo.global.`,
  },
  ig: {
    subject: "Emechiri akaụntụ OBIGBO gị nwa oge",
    body: (d: Record<string, unknown>) =>
      `<p>Ndewo ${escHtml(d.name)},</p>
       <p>Ndị ọrụ nlele OBIGBO <strong>emechiri</strong> akaụntụ gị nwa oge.</p>
       <p><strong>Ihe mere:</strong></p>
       <blockquote style="border-left:3px solid #D4631F;padding-left:12px;color:#444;margin:12px 0">${escHtml(d.reason)}</blockquote>
       <p><strong>Oge:</strong> ${escHtml(d.duration)}</p>
       ${d.endsAt ? `<p><strong>Oge imechi ga-agwụ:</strong> ${escHtml(d.endsAt)}</p>` : ""}
       <p>N'oge imechi a, ị gaghị enwe ike ịbanye na ngwa. Akaụntụ gị ga-emeghe n'onwe ya mgbe oge imechi gwụsịrị.</p>
       <p style="color:#666;font-size:14px">Ọ bụrụ na ọ dị njọ, biko kpọtụrụ anyị na support@igbo.global.</p>`,
    text: (d: Record<string, unknown>) =>
      `Ndewo ${String(d.name)},\n\nEmechiri akaụntụ OBIGBO gị nwa oge.\n\nIhe mere: ${String(d.reason)}\nOge: ${String(d.duration)}${d.endsAt ? `\nOge imechi ga-agwụ: ${String(d.endsAt)}` : ""}\n\nAkaụntụ gị ga-emeghe n'onwe ya mgbe oge imechi gwụsịrị.\n\nỌ bụrụ na ọ dị njọ, biko kpọtụrụ anyị na support@igbo.global.`,
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
