import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

const COPY = {
  en: {
    subject: "OBIGBO needs more information about your application",
    body: (d: Record<string, unknown>) =>
      `<p>Hello ${escHtml(d.name)},</p>
       <p>Thank you for your interest in OBIGBO. We have reviewed your application and need a bit more information before we can make a decision.</p>
       <p><strong>Message from our team:</strong></p>
       <blockquote style="border-left:4px solid #D4631F;margin:16px 0;padding:12px 16px;background:#faf8f6;color:#333">
         ${escHtml(d.message)}
       </blockquote>
       <p>Please reply to this email with the requested information at your earliest convenience.</p>
       <p style="color:#666;font-size:14px">If you have any questions, contact us at support@igbo.global.</p>`,
    text: (d: Record<string, unknown>) =>
      `Hello ${String(d.name)},\n\nThank you for your interest in OBIGBO. We need a bit more information about your application.\n\nMessage from our team:\n${String(d.message)}\n\nPlease reply to this email with the requested information.\n\nIf you have any questions, contact us at support@igbo.global.`,
  },
  ig: {
    subject: "OBIGBO chọrọ ozi ndị ọzọ gbasara arịọ gị",
    body: (d: Record<string, unknown>) =>
      `<p>Ndewo ${escHtml(d.name)},</p>
       <p>Daalụ maka mmasị gị na OBIGBO. Anyị elere arịọ gị ma chọrọ ozi ndị ọzọ tupu anyị eme mkpebi.</p>
       <p><strong>Ọkwa sitere n'aka ndị otu anyị:</strong></p>
       <blockquote style="border-left:4px solid #D4631F;margin:16px 0;padding:12px 16px;background:#faf8f6;color:#333">
         ${escHtml(d.message)}
       </blockquote>
       <p>Biko zaa email a na ozi anyị chọrọ n'oge na-adịghị anya.</p>
       <p style="color:#666;font-size:14px">Ọ bụrụ na ị nwere ajụjụ ọ bụla, kpọtụrụ anyị na support@igbo.global.</p>`,
    text: (d: Record<string, unknown>) =>
      `Ndewo ${String(d.name)},\n\nDaalụ maka mmasị gị na OBIGBO. Anyị chọrọ ozi ndị ọzọ gbasara arịọ gị.\n\nỌkwa sitere n'aka ndị otu anyị:\n${String(d.message)}\n\nBiko zaa email a na ozi anyị chọrọ.\n\nỌ bụrụ na ị nwere ajụjụ ọ bụla, kpọtụrụ anyị na support@igbo.global.`,
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
