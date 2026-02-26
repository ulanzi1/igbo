import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

const COPY = {
  en: {
    subject: "Reset your OBIGBO password",
    body: (d: Record<string, unknown>) =>
      `<p>Hello ${escHtml(d.name)},</p>
       <p>We received a request to reset your OBIGBO password. Click the button below to set a new password:</p>
       <p style="text-align:center;margin:32px 0">
         <a href="${escHtml(d.resetUrl)}"
            style="background:#D4631F;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block">
           Reset Password
         </a>
       </p>
       <p>This link expires in <strong>1 hour</strong>.</p>
       <p style="color:#666;font-size:14px">If you didn't request a password reset, please ignore this email. Your password will not be changed.</p>`,
    text: (d: Record<string, unknown>) =>
      `Hello ${String(d.name)},\n\nWe received a request to reset your OBIGBO password.\n\nReset your password: ${String(d.resetUrl)}\n\nThis link expires in 1 hour.\n\nIf you didn't request a password reset, ignore this email.`,
  },
  ig: {
    subject: "Tọgharia okwuntughe OBIGBO gị",
    body: (d: Record<string, unknown>) =>
      `<p>Ndewo ${escHtml(d.name)},</p>
       <p>Anyị natara arịọ ịtọgharia okwuntughe OBIGBO gị. Pịa bọtịn dị n'okpuru ka ị tọgharia okwuntughe ọhụrụ:</p>
       <p style="text-align:center;margin:32px 0">
         <a href="${escHtml(d.resetUrl)}"
            style="background:#D4631F;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block">
           Tọgharia Okwuntughe
         </a>
       </p>
       <p>Njikọ a ga-akwụsị n'ime <strong>otu awa</strong>.</p>
       <p style="color:#666;font-size:14px">Ọ bụrụ na ị arịọghị ịtọgharia okwuntughe, hapụ email a. Agaghị agbanwee okwuntughe gị.</p>`,
    text: (d: Record<string, unknown>) =>
      `Ndewo ${String(d.name)},\n\nAnyị natara arịọ ịtọgharia okwuntughe OBIGBO gị.\n\nTọgharia okwuntughe gị: ${String(d.resetUrl)}\n\nNjikọ a ga-akwụsị n'ime otu awa.\n\nỌ bụrụ na ị arịọghị ịtọgharia okwuntughe, hapụ email a.`,
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
