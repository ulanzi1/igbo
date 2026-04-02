import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

const COPY = {
  en: {
    subject: "You were signed out on another device",
    body: (d: Record<string, unknown>) =>
      `<p>Hello ${escHtml(d.name)},</p>
       <p>You have been signed out from a session on another device. This may have happened because:</p>
       <ul style="padding-left:20px;line-height:1.8">
         <li>You signed in from a new device and your session limit was reached</li>
         <li>An administrator revoked your session</li>
       </ul>
       <p>If this was unexpected, please sign in again and review your active sessions in account settings.</p>
       <p style="color:#666;font-size:14px">If you did not authorize this action, please contact support@igbo.global immediately.</p>`,
    text: (d: Record<string, unknown>) =>
      `Hello ${String(d.name)},\n\nYou have been signed out from a session on another device.\n\nIf this was unexpected, please sign in again and review your active sessions in account settings.\n\nIf you did not authorize this action, please contact support@igbo.global immediately.`,
  },
  ig: {
    subject: "Ị pụọla na ngwaọrụ ọzọ",
    body: (d: Record<string, unknown>) =>
      `<p>Ndewo ${escHtml(d.name)},</p>
       <p>E wepụla gị na oge ịme nke ọzọ n'ngwaọrụ ọzọ. Nke a nwere ike ịme n'ihi:</p>
       <ul style="padding-left:20px;line-height:1.8">
         <li>Ị banyere n'ngwaọrụ ọhụrụ ma enwetara ihe ọkachamara oge ịme gị</li>
         <li>Onye njikwa kwụsịrị oge ịme gị</li>
       </ul>
       <p>Ọ bụrụ na nke a adịghị atụ anya, biko banye ọzọ ma lelee oge ịme gị ndị ọ na-arụ ọrụ na ntọala akaụntụ.</p>
       <p style="color:#666;font-size:14px">Ọ bụrụ na ị nyeghị ikike maka nke a, biko kpọtụrụ support@igbo.global ozugbo.</p>`,
    text: (d: Record<string, unknown>) =>
      `Ndewo ${String(d.name)},\n\nE wepụla gị na oge ịme nke ọzọ n'ngwaọrụ ọzọ.\n\nỌ bụrụ na nke a adịghị atụ anya, biko banye ọzọ ma lelee oge ịme gị ndị ọ na-arụ ọrụ na ntọala akaụntụ.\n\nỌ bụrụ na ị nyeghị ikike maka nke a, biko kpọtụrụ support@igbo.global ozugbo.`,
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
