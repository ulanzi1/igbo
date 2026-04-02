import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

const COPY = {
  en: {
    subject: "Your OBIGBO sign-in code",
    body: (d: Record<string, unknown>) =>
      `<p>Hello ${escHtml(d.name)},</p>
       <p>Here is your one-time sign-in code for OBIGBO:</p>
       <p style="text-align:center;margin:32px 0">
         <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#D4631F;font-family:monospace">${escHtml(d.otp)}</span>
       </p>
       <p>This code expires in <strong>${escHtml(d.expiresMinutes ?? 10)} minutes</strong>. Do not share it with anyone.</p>
       <p style="color:#666;font-size:14px">If you didn't request this code, please ignore this email. Your account remains secure.</p>`,
    text: (d: Record<string, unknown>) =>
      `Hello ${String(d.name)},\n\nYour OBIGBO sign-in code is: ${String(d.otp)}\n\nThis code expires in ${String(d.expiresMinutes ?? 10)} minutes. Do not share it with anyone.\n\nIf you didn't request this code, ignore this email.`,
  },
  ig: {
    subject: "Koodu ịbanye OBIGBO gị",
    body: (d: Record<string, unknown>) =>
      `<p>Ndewo ${escHtml(d.name)},</p>
       <p>Nke a bụ koodu ịbanye otu-oge gị maka OBIGBO:</p>
       <p style="text-align:center;margin:32px 0">
         <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#D4631F;font-family:monospace">${escHtml(d.otp)}</span>
       </p>
       <p>Koodu a ga-akwụsị n'ime nkeji <strong>${escHtml(d.expiresMinutes ?? 10)}</strong>. Ekwela ha ọ bụla.</p>
       <p style="color:#666;font-size:14px">Ọ bụrụ na ị arịọghị koodu a, hapụ email a. Akaụntụ gị dị nchedo.</p>`,
    text: (d: Record<string, unknown>) =>
      `Ndewo ${String(d.name)},\n\nKoodu ịbanye OBIGBO gị bụ: ${String(d.otp)}\n\nKoodu a ga-akwụsị n'ime nkeji ${String(d.expiresMinutes ?? 10)}. Ekwela ha ọ bụla.\n\nỌ bụrụ na ị arịọghị koodu a, hapụ email a.`,
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
