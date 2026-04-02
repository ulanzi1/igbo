import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

const COPY = {
  en: {
    subject: "Your OBIGBO password has been reset",
    body: (d: Record<string, unknown>) =>
      `<p>Hello ${escHtml(d.name)},</p>
       <p>Your OBIGBO password has been successfully reset.</p>
       <p>If you made this change, no further action is required.</p>
       <p style="color:#666;font-size:14px">If you did not reset your password, please contact us immediately at support@igbo.global. Your account security may be at risk.</p>`,
    text: (d: Record<string, unknown>) =>
      `Hello ${String(d.name)},\n\nYour OBIGBO password has been successfully reset.\n\nIf you made this change, no further action is required.\n\nIf you did not reset your password, please contact us immediately at support@igbo.global.`,
  },
  ig: {
    subject: "Atọghariala okwuntughe OBIGBO gị",
    body: (d: Record<string, unknown>) =>
      `<p>Ndewo ${escHtml(d.name)},</p>
       <p>Atọghariala okwuntughe OBIGBO gị nke ọma.</p>
       <p>Ọ bụrụ na ị mere mgbanwe a, ọ dịghị ihe ọzọ ị ga-eme.</p>
       <p style="color:#666;font-size:14px">Ọ bụrụ na ị tọghariaghi okwuntughe gị, biko kpọtụrụ anyị ozugbo na support@igbo.global. Nchedo akaụntụ gị nwere ike ịdị n'ihe egwu.</p>`,
    text: (d: Record<string, unknown>) =>
      `Ndewo ${String(d.name)},\n\nAtọghariala okwuntughe OBIGBO gị nke ọma.\n\nỌ bụrụ na ị mere mgbanwe a, ọ dịghị ihe ọzọ ị ga-eme.\n\nỌ bụrụ na ị tọghariaghi okwuntughe gị, biko kpọtụrụ anyị ozugbo na support@igbo.global.`,
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
