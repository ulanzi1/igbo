import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

const COPY = {
  en: {
    subject: "Welcome to OBIGBO — your application is approved",
    body: (d: Record<string, unknown>) =>
      `<p>Hello ${escHtml(d.name)},</p>
       <p>Congratulations! Your OBIGBO membership application has been approved. Welcome to the community!</p>
       <p>To get started, set your password by clicking the button below. This link expires in 24 hours.</p>
       <p style="text-align:center;margin:32px 0">
         <a href="${escHtml(d.setPasswordUrl)}"
            style="background:#D4631F;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block">
           Set Your Password
         </a>
       </p>
       <p style="color:#666;font-size:14px">We're excited to have you as part of our growing community.</p>`,
    text: (d: Record<string, unknown>) =>
      `Hello ${String(d.name)},\n\nCongratulations! Your OBIGBO membership application has been approved. Welcome to the community!\n\nSet your password here (link expires in 24 hours):\n${String(d.setPasswordUrl)}\n\nWe're excited to have you as part of our growing community.`,
  },
  ig: {
    subject: "Nnọ na OBIGBO — anyị nabatara gị",
    body: (d: Record<string, unknown>) =>
      `<p>Ndewo ${escHtml(d.name)},</p>
       <p>Ọ dị mma! Anyị nabatara arịọ ọbịbịa gị na OBIGBO. Nnọ n'otu anyị!</p>
       <p>Iji malite, tọọ paswọọdụ gị site na ịpị bọtịnnụ dị n'ala. Njikọ a ga-akwụsị n'ime awa iri abụọ na anọ.</p>
       <p style="text-align:center;margin:32px 0">
         <a href="${escHtml(d.setPasswordUrl)}"
            style="background:#D4631F;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block">
           Tọọ Paswọọdụ Gị
         </a>
       </p>
       <p style="color:#666;font-size:14px">Anyị na-atọ ụtọ nwere gị dị ka onye otu anyị.</p>`,
    text: (d: Record<string, unknown>) =>
      `Ndewo ${String(d.name)},\n\nỌ dị mma! Anyị nabatara arịọ ọbịbịa gị na OBIGBO. Nnọ n'otu anyị!\n\nTọọ paswọọdụ gị ebe a (njikọ a ga-akwụsị n'ime awa iri abụọ na anọ):\n${String(d.setPasswordUrl)}\n\nAnyị na-atọ ụtọ nwere gị dị ka onye otu anyị.`,
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
