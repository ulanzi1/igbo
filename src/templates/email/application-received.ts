import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

const COPY = {
  en: {
    subject: "Your OBIGBO application is received",
    body: (d: Record<string, unknown>) =>
      `<p>Hello ${escHtml(d.name)},</p>
       <p>Thank you for applying to OBIGBO. We have received your application and will review it shortly.</p>
       <p>Our team typically reviews applications within 2–5 business days. You'll receive an email once a decision has been made.</p>
       <p style="color:#666;font-size:14px">If you have any questions, please contact us at support@igbo.global.</p>`,
    text: (d: Record<string, unknown>) =>
      `Hello ${String(d.name)},\n\nThank you for applying to OBIGBO. We have received your application and will review it shortly.\n\nOur team typically reviews applications within 2–5 business days. You'll receive an email once a decision has been made.\n\nIf you have any questions, please contact us at support@igbo.global.`,
  },
  ig: {
    subject: "Anyị natara arịọ ọbịbịa gị na OBIGBO",
    body: (d: Record<string, unknown>) =>
      `<p>Ndewo ${escHtml(d.name)},</p>
       <p>Daalụ maka arịọ ọbịbịa gị na OBIGBO. Anyị natara arịọ gị ma ga-elele ya n'oge na-adịghị anya.</p>
       <p>Ndị otu anyị na-elele arịọ ndị dị n'ime ụbọchị ọrụ 2–5. Ị ga-enweta email mgbe anyị emechara mkpebi.</p>
       <p style="color:#666;font-size:14px">Ọ bụrụ na ị nwere ajụjụ ọ bụla, biko kpọtụrụ anyị na support@igbo.global.</p>`,
    text: (d: Record<string, unknown>) =>
      `Ndewo ${String(d.name)},\n\nDaalụ maka arịọ ọbịbịa gị na OBIGBO. Anyị natara arịọ gị ma ga-elele ya n'oge na-adịghị anya.\n\nNdị otu anyị na-elele arịọ ndị dị n'ime ụbọchị ọrụ 2–5.\n\nỌ bụrụ na ị nwere ajụjụ ọ bụla, biko kpọtụrụ anyị na support@igbo.global.`,
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
