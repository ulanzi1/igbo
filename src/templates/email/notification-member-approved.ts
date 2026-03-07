import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

const UNSUBSCRIBE_URL = "/settings/notifications";

const COPY = {
  en: {
    subject: "Your membership has been approved — welcome to OBIGBO!",
    body: (d: Record<string, unknown>) =>
      `<p>Hello ${escHtml(d.name)},</p>
       <p>Great news! Your OBIGBO membership has been approved. You now have full access to the platform.</p>
       <p><a href="/dashboard" style="color:#D4631F;font-weight:600">Explore the community →</a></p>
       <p style="color:#666;font-size:14px">We're excited to have you as part of the OBIGBO family!</p>`,
    text: (d: Record<string, unknown>) =>
      `Hello ${String(d.name)},\n\nGreat news! Your OBIGBO membership has been approved. You now have full access to the platform.\n\nExplore the community: /dashboard\n\nWe're excited to have you as part of the OBIGBO family!`,
  },
  ig: {
    subject: "A kwadoro onye otu gị — nnọọ na OBIGBO!",
    body: (d: Record<string, unknown>) =>
      `<p>Ndewo ${escHtml(d.name)},</p>
       <p>Ozi ọma! A kwadoro onye otu gị na OBIGBO. Ugbu a ị nwere ohere ịbanye n'ihe niile dị na ikpo okwu.</p>
       <p><a href="/dashboard" style="color:#D4631F;font-weight:600">Nwale obodo →</a></p>
       <p style="color:#666;font-size:14px">Anyị na-ọ̀ njọ ịnweta gị dị ka onye otu ezinụlọ OBIGBO!</p>`,
    text: (d: Record<string, unknown>) =>
      `Ndewo ${String(d.name)},\n\nOzi ọma! A kwadoro onye otu gị na OBIGBO. Ugbu a ị nwere ohere ịbanye n'ihe niile dị na ikpo okwu.\n\nNwale obodo: /dashboard\n\nAnyị na-ọ̀ njọ ịnweta gị dị ka onye otu ezinụlọ OBIGBO!`,
  },
} as const;

export function render(data: Record<string, unknown>, locale: "en" | "ig"): EmailTemplateResult {
  const lang = locale === "ig" ? "ig" : "en";
  const c = COPY[lang];
  return {
    subject: c.subject,
    html: renderBase(c.body(data), lang, UNSUBSCRIBE_URL),
    text: c.text(data),
  };
}
