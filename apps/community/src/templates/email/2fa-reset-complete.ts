import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

const COPY = {
  en: {
    subject: "Your OBIGBO two-factor authentication has been reset",
    body: (d: Record<string, unknown>) =>
      `<p>Hello ${escHtml(d.name)},</p>
       <p>Your two-factor authentication (2FA) for OBIGBO has been successfully reset.</p>
       <p>You can now set up a new 2FA method in your account security settings.</p>
       <p style="color:#666;font-size:14px">If you did not request this change, please contact us immediately at support@igbo.global. Your account security may be at risk.</p>`,
    text: (d: Record<string, unknown>) =>
      `Hello ${String(d.name)},\n\nYour two-factor authentication (2FA) for OBIGBO has been successfully reset.\n\nYou can now set up a new 2FA method in your account security settings.\n\nIf you did not request this change, please contact us immediately at support@igbo.global.`,
  },
  ig: {
    subject: "Atọghariala njikwa abụọ-oge OBIGBO gị",
    body: (d: Record<string, unknown>) =>
      `<p>Ndewo ${escHtml(d.name)},</p>
       <p>Atọghariala njikwa abụọ-oge (2FA) OBIGBO gị nke ọma.</p>
       <p>Ị nwere ike ịhọrọ ụzọ 2FA ọhụrụ n'ntọala nchedo akaụntụ gị ugbu a.</p>
       <p style="color:#666;font-size:14px">Ọ bụrụ na ị arịọghị mgbanwe a, biko kpọtụrụ anyị ozugbo na support@igbo.global. Nchedo akaụntụ gị nwere ike ịdị n'ihe egwu.</p>`,
    text: (d: Record<string, unknown>) =>
      `Ndewo ${String(d.name)},\n\nAtọghariala njikwa abụọ-oge (2FA) OBIGBO gị nke ọma.\n\nỊ nwere ike ịhọrọ ụzọ 2FA ọhụrụ n'ntọala nchedo akaụntụ gị ugbu a.\n\nỌ bụrụ na ị arịọghị mgbanwe a, biko kpọtụrụ anyị ozugbo na support@igbo.global.`,
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
