import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

const COPY = {
  en: {
    subject: "Update on your OBIGBO membership application",
    body: (d: Record<string, unknown>) =>
      `<p>Hello ${escHtml(d.name)},</p>
       <p>Thank you for your interest in joining OBIGBO. After careful consideration, we are unable to approve your membership application at this time.</p>
       <p>We appreciate the time you took to apply and hope you understand that we carefully consider all applications.</p>
       <p style="color:#666;font-size:14px">If you have questions, please contact us at support@igbo.global.</p>`,
    text: (d: Record<string, unknown>) =>
      `Hello ${String(d.name)},\n\nThank you for your interest in joining OBIGBO. After careful consideration, we are unable to approve your membership application at this time.\n\nWe appreciate the time you took to apply.\n\nIf you have questions, please contact us at support@igbo.global.`,
  },
  ig: {
    subject: "Ọnọdụ arịọ ọbịbịa gị na OBIGBO",
    body: (d: Record<string, unknown>) =>
      `<p>Ndewo ${escHtml(d.name)},</p>
       <p>Daalụ maka mmasị gị ịbanye OBIGBO. Mgbe anyị elere arịọ gị nke ọma, anyị enweghị ike nabata arịọ ọbịbịa gị n'oge a.</p>
       <p>Anyị na-atọ ụtọ maka oge ị nọọ ịrịọ, anyị na-atụ aro ka ị ghọta na anyị na-elere arịọ ndị niile nke ọma.</p>
       <p style="color:#666;font-size:14px">Ọ bụrụ na ị nwere ajụjụ ọ bụla, biko kpọtụrụ anyị na support@igbo.global.</p>`,
    text: (d: Record<string, unknown>) =>
      `Ndewo ${String(d.name)},\n\nDaalụ maka mmasị gị ịbanye OBIGBO. Mgbe anyị elere arịọ gị nke ọma, anyị enweghị ike nabata arịọ ọbịbịa gị n'oge a.\n\nAnyị na-atọ ụtọ maka oge ị nọọ ịrịọ.\n\nỌ bụrụ na ị nwere ajụjụ ọ bụla, biko kpọtụrụ anyị na support@igbo.global.`,
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
