import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

const COPY = {
  en: {
    subject: "Your OBIGBO account has been temporarily locked",
    body: (d: Record<string, unknown>) =>
      `<p>Hello ${escHtml(d.name)},</p>
       <p>Your OBIGBO account has been temporarily locked due to too many failed sign-in attempts.</p>
       <p><strong>Details:</strong></p>
       <ul style="padding-left:20px;line-height:1.8">
         <li>IP address: ${escHtml(d.ip)}</li>
         <li>Lockout duration: ${escHtml(d.lockoutMinutes)} minutes</li>
       </ul>
       <p>Your account will be automatically unlocked after the lockout period. If you did not make these attempts, please contact us immediately at support@igbo.global.</p>
       <p style="color:#666;font-size:14px">If you believe this was unauthorized access, please change your password once your account is unlocked.</p>`,
    text: (d: Record<string, unknown>) =>
      `Hello ${String(d.name)},\n\nYour OBIGBO account has been temporarily locked due to too many failed sign-in attempts.\n\nDetails:\n- IP address: ${String(d.ip)}\n- Lockout duration: ${String(d.lockoutMinutes)} minutes\n\nYour account will be automatically unlocked after the lockout period.\n\nIf you did not make these attempts, please contact us at support@igbo.global.`,
  },
  ig: {
    subject: "Achichiara akaụntụ OBIGBO gị oge nta",
    body: (d: Record<string, unknown>) =>
      `<p>Ndewo ${escHtml(d.name)},</p>
       <p>Achichiara akaụntụ OBIGBO gị oge nta n'ihi ọtụtụ mgbalị ịbanye ndị agaghị ire.</p>
       <p><strong>Nkọwa:</strong></p>
       <ul style="padding-left:20px;line-height:1.8">
         <li>Adreesi IP: ${escHtml(d.ip)}</li>
         <li>Oge nchichi: nkeji ${escHtml(d.lockoutMinutes)}</li>
       </ul>
       <p>A ga-emeghe akaụntụ gị n'ozuzu mgbe oge nchichi agachaa. Ọ bụrụ na ị emeghị oge ndị a, biko kpọtụrụ anyị ozugbo na support@igbo.global.</p>
       <p style="color:#666;font-size:14px">Ọ bụrụ na ị chere na nke a bụ nnwere ike n'enweghị ikike, biko gbanwee okwuntughe gị mgbe eweghachiri akaụntụ gị.</p>`,
    text: (d: Record<string, unknown>) =>
      `Ndewo ${String(d.name)},\n\nAchichiara akaụntụ OBIGBO gị oge nta n'ihi ọtụtụ mgbalị ịbanye ndị agaghị ire.\n\nNkọwa:\n- Adreesi IP: ${String(d.ip)}\n- Oge nchichi: nkeji ${String(d.lockoutMinutes)}\n\nA ga-emeghe akaụntụ gị n'ozuzu mgbe oge nchichi agachaa.\n\nỌ bụrụ na ị emeghị oge ndị a, biko kpọtụrụ anyị na support@igbo.global.`,
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
