import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

const COPY = {
  en: {
    subject: "Your article has been published on OBIGBO!",
    body: (d: Record<string, unknown>) =>
      `<p>Hello ${escHtml(d.name)},</p>
       <p>Congratulations! Your article <strong>${escHtml(d.title)}</strong> has been published and is now visible to the community.</p>
       <p><a href="${escHtml(d.articleUrl)}" style="color:#D4631F;font-weight:600">Read your article →</a></p>
       <p style="color:#666;font-size:14px">Thank you for contributing to OBIGBO!</p>`,
    text: (d: Record<string, unknown>) =>
      `Hello ${String(d.name)},\n\nCongratulations! Your article "${String(d.title)}" has been published and is now visible to the community.\n\nRead your article: ${String(d.articleUrl)}\n\nThank you for contributing to OBIGBO!`,
  },
  ig: {
    subject: "Ebipụtara akụkọ gị na OBIGBO!",
    body: (d: Record<string, unknown>) =>
      `<p>Ndewo ${escHtml(d.name)},</p>
       <p>Ọ dị mma! A bipụtara akụkọ gị <strong>${escHtml(d.title)}</strong> ma ugbu a ọha nwere ike ịhụ ya.</p>
       <p><a href="${escHtml(d.articleUrl)}" style="color:#D4631F;font-weight:600">Gụọ akụkọ gị →</a></p>
       <p style="color:#666;font-size:14px">Daalụ maka ntinye gị na OBIGBO!</p>`,
    text: (d: Record<string, unknown>) =>
      `Ndewo ${String(d.name)},\n\nỌ dị mma! A bipụtara akụkọ gị "${String(d.title)}" ma ugbu a ọha nwere ike ịhụ ya.\n\nGụọ akụkọ gị: ${String(d.articleUrl)}\n\nDaalụ maka ntinye gị na OBIGBO!`,
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
