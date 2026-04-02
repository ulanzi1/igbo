import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

const UNSUBSCRIBE_URL = "/settings/notifications";

const COPY = {
  en: {
    subject: "Group activity notification on OBIGBO",
    body: (d: Record<string, unknown>) =>
      `<p>Hello ${escHtml(d.name)},</p>
       <p><strong>${escHtml(d.title)}</strong></p>
       <p>${escHtml(d.body)}</p>
       <p><a href="${escHtml(d.link ?? "/dashboard")}" style="color:#D4631F;font-weight:600">View on OBIGBO →</a></p>`,
    text: (d: Record<string, unknown>) =>
      `Hello ${String(d.name)},\n\n${String(d.title)}\n\n${String(d.body)}\n\nView on OBIGBO: ${String(d.link ?? "/dashboard")}`,
  },
  ig: {
    subject: "Ọkwa ọrụ otu na OBIGBO",
    body: (d: Record<string, unknown>) =>
      `<p>Ndewo ${escHtml(d.name)},</p>
       <p><strong>${escHtml(d.title)}</strong></p>
       <p>${escHtml(d.body)}</p>
       <p><a href="${escHtml(d.link ?? "/dashboard")}" style="color:#D4631F;font-weight:600">Hụ na OBIGBO →</a></p>`,
    text: (d: Record<string, unknown>) =>
      `Ndewo ${String(d.name)},\n\n${String(d.title)}\n\n${String(d.body)}\n\nHụ na OBIGBO: ${String(d.link ?? "/dashboard")}`,
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
