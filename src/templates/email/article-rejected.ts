import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

const COPY = {
  en: {
    subject: "Your OBIGBO article submission was not approved",
    body: (d: Record<string, unknown>) =>
      `<p>Hello ${escHtml(d.name)},</p>
       <p>Thank you for submitting your article <strong>${escHtml(d.title)}</strong> to OBIGBO. After careful review, we were unable to approve it for publication at this time.</p>
       ${d.feedback ? `<p><strong>Feedback from our team:</strong></p><blockquote style="border-left:3px solid #D4631F;padding-left:12px;color:#444;margin:12px 0">${escHtml(d.feedback)}</blockquote>` : ""}
       <p>You are welcome to revise and resubmit your article: <a href="${escHtml(d.editUrl)}" style="color:#D4631F;font-weight:600">Edit your article →</a></p>
       <p style="color:#666;font-size:14px">If you have questions, please contact us at support@igbo.global.</p>`,
    text: (d: Record<string, unknown>) =>
      `Hello ${String(d.name)},\n\nThank you for submitting your article "${String(d.title)}" to OBIGBO. After careful review, we were unable to approve it for publication at this time.\n\n${d.feedback ? `Feedback: ${String(d.feedback)}\n\n` : ""}You are welcome to revise and resubmit: ${String(d.editUrl)}\n\nIf you have questions, please contact us at support@igbo.global.`,
  },
  ig: {
    subject: "Ihe a-zipụrụ maka OBIGBO enweghị nkwado",
    body: (d: Record<string, unknown>) =>
      `<p>Ndewo ${escHtml(d.name)},</p>
       <p>Daalụ maka izipu akụkọ gị <strong>${escHtml(d.title)}</strong> na OBIGBO. Mgbe anyị enyochara ya nke ọma, anyị enweghị ike ikwado ya maka mbipụta n'oge a.</p>
       ${d.feedback ? `<p><strong>Nzaghachi si n'aka ndị ọrụ anyị:</strong></p><blockquote style="border-left:3px solid #D4631F;padding-left:12px;color:#444;margin:12px 0">${escHtml(d.feedback)}</blockquote>` : ""}
       <p>Ị nwere ike ịgbanwe ma zipu ọzọ: <a href="${escHtml(d.editUrl)}" style="color:#D4631F;font-weight:600">Dezie akụkọ gị →</a></p>
       <p style="color:#666;font-size:14px">Ọ bụrụ na ị nwere ajụjụ, biko kpọtụrụ anyị na support@igbo.global.</p>`,
    text: (d: Record<string, unknown>) =>
      `Ndewo ${String(d.name)},\n\nDaalụ maka izipu akụkọ gị "${String(d.title)}" na OBIGBO. Mgbe anyị enyochara ya nke ọma, anyị enweghị ike ikwado ya maka mbipụta n'oge a.\n\n${d.feedback ? `Nzaghachi: ${String(d.feedback)}\n\n` : ""}Ị nwere ike ịgbanwe ma zipu ọzọ: ${String(d.editUrl)}\n\nỌ bụrụ na ị nwere ajụjụ, biko kpọtụrụ anyị na support@igbo.global.`,
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
