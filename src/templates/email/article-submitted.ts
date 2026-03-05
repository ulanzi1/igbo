import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

const COPY = {
  en: {
    subject: "We received your article submission on OBIGBO",
    body: (d: Record<string, unknown>) =>
      `<p>Hello ${escHtml(d.name)},</p>
       <p>Thank you for submitting your article <strong>${escHtml(d.title)}</strong> for review.</p>
       <p>We appreciate your contribution to the community. Please allow us 2–3 days to review your article. You will receive an email once it has been approved.</p>
       <p style="color:#666;font-size:14px">Thank you for contributing to OBIGBO!</p>`,
    text: (d: Record<string, unknown>) =>
      `Hello ${String(d.name)},\n\nThank you for submitting your article "${String(d.title)}" for review.\n\nWe appreciate your contribution to the community. Please allow us 2–3 days to review your article. You will receive an email once it has been approved.\n\nThank you for contributing to OBIGBO!`,
  },
  ig: {
    subject: "Anyị natara akụkọ gị na OBIGBO",
    body: (d: Record<string, unknown>) =>
      `<p>Ndewo ${escHtml(d.name)},</p>
       <p>Daalụ maka nzipu akụkọ gị <strong>${escHtml(d.title)}</strong> maka nlele.</p>
       <p>Anyị ekele maka ntinye gị n'obodo a. Biko nye anyị ụbọchị 2–3 iji nyochaa akụkọ gị. Ị ga-enweta email mgbe ọ nwetara nkwado.</p>
       <p style="color:#666;font-size:14px">Daalụ maka ntinye gị na OBIGBO!</p>`,
    text: (d: Record<string, unknown>) =>
      `Ndewo ${String(d.name)},\n\nDaalụ maka nzipu akụkọ gị "${String(d.title)}" maka nlele.\n\nAnyị ekele maka ntinye gị n'obodo a. Biko nye anyị ụbọchị 2–3 iji nyochaa akụkọ gị. Ị ga-enweta email mgbe ọ nwetara nkwado.\n\nDaalụ maka ntinye gị na OBIGBO!`,
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
