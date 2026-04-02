import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

const COPY = {
  en: {
    subject: "Verify your OBIGBO email address",
    body: (d: Record<string, unknown>) =>
      `<p>Hello ${escHtml(d.name)},</p>
       <p>Please verify your email address to complete your OBIGBO membership application.</p>
       <p style="text-align:center;margin:32px 0">
         <a href="${escHtml(d.verifyUrl)}"
            style="background:#D4631F;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block">
           Verify Email Address
         </a>
       </p>
       <p style="color:#666;font-size:14px">This link expires in 24 hours. If you didn't apply, please ignore this email.</p>`,
    text: (d: Record<string, unknown>) =>
      `Hello ${String(d.name)},\n\nVerify your OBIGBO email address:\n${String(d.verifyUrl)}\n\nThis link expires in 24 hours.\nIf you didn't apply, ignore this email.`,
  },
  ig: {
    subject: "Kwenye adreesi email OBIGBO gị",
    body: (d: Record<string, unknown>) =>
      `<p>Ndewo ${escHtml(d.name)},</p>
       <p>Biko kwenye adreesi email gị ka ị nwee ike ịmalite ịnọ n'otu OBIGBO.</p>
       <p style="text-align:center;margin:32px 0">
         <a href="${escHtml(d.verifyUrl)}"
            style="background:#D4631F;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block">
           Kwenye Adreesi Email
         </a>
       </p>
       <p style="color:#666;font-size:14px">Njikọ a ga-akwụsị n'ime awa iri abụọ na anọ. Ọ bụrụ na ị arịọghị, hapụ email a.</p>`,
    text: (d: Record<string, unknown>) =>
      `Ndewo ${String(d.name)},\n\nKwenye adreesi email OBIGBO gị:\n${String(d.verifyUrl)}\n\nNjikọ a ga-akwụsị n'ime awa iri abụọ na anọ.`,
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
