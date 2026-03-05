import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

const COPY = {
  en: {
    subject: "Revision requested for your OBIGBO article",
    body: (d: Record<string, unknown>) =>
      `<p>Hello ${escHtml(d.name)},</p>
       <p>Thank you for submitting your article <strong>${escHtml(d.title)}</strong> to OBIGBO. Our team has reviewed it and is requesting some revisions before it can be published.</p>
       <p><strong>Revision notes from our team:</strong></p>
       <blockquote style="border-left:3px solid #D4631F;padding-left:12px;color:#444;margin:12px 0">${escHtml(d.feedback)}</blockquote>
       <p>Please review the feedback and update your article: <a href="${escHtml(d.editUrl)}" style="color:#D4631F;font-weight:600">Edit your article →</a></p>
       <p style="color:#666;font-size:14px">Once you've made your changes, you can resubmit for review. If you have questions, please contact us at support@igbo.global.</p>`,
    text: (d: Record<string, unknown>) =>
      `Hello ${String(d.name)},\n\nThank you for submitting your article "${String(d.title)}" to OBIGBO. Our team has reviewed it and is requesting some revisions before it can be published.\n\nRevision notes: ${String(d.feedback)}\n\nPlease update your article and resubmit: ${String(d.editUrl)}\n\nIf you have questions, please contact us at support@igbo.global.`,
  },
  ig: {
    subject: "Achọrọ mgbanwe n'akụkọ gị na OBIGBO",
    body: (d: Record<string, unknown>) =>
      `<p>Ndewo ${escHtml(d.name)},</p>
       <p>Daalụ maka izipu akụkọ gị <strong>${escHtml(d.title)}</strong> na OBIGBO. Ndị ọrụ anyị enyochara ya ma na-arịọ mgbanwe ụfọdụ tupu a ga-ebipụta ya.</p>
       <p><strong>Ndetu mgbanwe si n'aka ndị ọrụ anyị:</strong></p>
       <blockquote style="border-left:3px solid #D4631F;padding-left:12px;color:#444;margin:12px 0">${escHtml(d.feedback)}</blockquote>
       <p>Biko lelee nzaghachi ma melite akụkọ gị: <a href="${escHtml(d.editUrl)}" style="color:#D4631F;font-weight:600">Dezie akụkọ gị →</a></p>
       <p style="color:#666;font-size:14px">Mgbe ị mechara mgbanwe, ị nwere ike iziga ọzọ maka nlele. Ọ bụrụ na ị nwere ajụjụ, biko kpọtụrụ anyị na support@igbo.global.</p>`,
    text: (d: Record<string, unknown>) =>
      `Ndewo ${String(d.name)},\n\nDaalụ maka izipu akụkọ gị "${String(d.title)}" na OBIGBO. Ndị ọrụ anyị enyochara ya ma na-arịọ mgbanwe ụfọdụ tupu a ga-ebipụta ya.\n\nNdetu mgbanwe: ${String(d.feedback)}\n\nBiko melite akụkọ gị ma zipu ọzọ: ${String(d.editUrl)}\n\nỌ bụrụ na ị nwere ajụjụ, biko kpọtụrụ anyị na support@igbo.global.`,
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
