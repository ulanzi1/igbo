import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

const UNSUBSCRIBE_URL = "/settings/notifications";

const COPY = {
  en: {
    subject: "You were mentioned in a message on OBIGBO",
    body: (d: Record<string, unknown>) =>
      `<p>Hello ${escHtml(d.name)},</p>
       <p>Someone mentioned you in a message:</p>
       <blockquote style="border-left:3px solid #D4631F;padding-left:12px;margin:12px 0;color:#555;font-style:italic">${escHtml(d.preview)}</blockquote>
       <p><a href="${escHtml(d.link ?? "/chat")}" style="color:#D4631F;font-weight:600">View message →</a></p>`,
    text: (d: Record<string, unknown>) =>
      `Hello ${String(d.name)},\n\nSomeone mentioned you in a message:\n\n"${String(d.preview)}"\n\nView message: ${String(d.link ?? "/chat")}`,
  },
  ig: {
    subject: "A kpọọ gị aha n'ọkwa na OBIGBO",
    body: (d: Record<string, unknown>) =>
      `<p>Ndewo ${escHtml(d.name)},</p>
       <p>Onye kpọọ gị aha n'ọkwa:</p>
       <blockquote style="border-left:3px solid #D4631F;padding-left:12px;margin:12px 0;color:#555;font-style:italic">${escHtml(d.preview)}</blockquote>
       <p><a href="${escHtml(d.link ?? "/chat")}" style="color:#D4631F;font-weight:600">Hụ ọkwa →</a></p>`,
    text: (d: Record<string, unknown>) =>
      `Ndewo ${String(d.name)},\n\nOnye kpọọ gị aha n'ọkwa:\n\n"${String(d.preview)}"\n\nHụ ọkwa: ${String(d.link ?? "/chat")}`,
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
