import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

const UNSUBSCRIBE_URL = "/settings/notifications";

const COPY = {
  en: {
    subject: "You received a new message on OBIGBO",
    body: (d: Record<string, unknown>) =>
      `<p>Hello ${escHtml(d.name)},</p>
       <p><strong>${escHtml(d.senderName)}</strong> sent you a message:</p>
       <blockquote style="border-left:3px solid #D4631F;margin:16px 0;padding:8px 16px;color:#444;font-style:italic">${escHtml(d.messagePreview)}</blockquote>
       <p><a href="${escHtml(d.chatUrl)}" style="color:#D4631F;font-weight:600">Reply in chat →</a></p>`,
    text: (d: Record<string, unknown>) =>
      `Hello ${String(d.name)},\n\n${String(d.senderName)} sent you a message:\n\n"${String(d.messagePreview)}"\n\nReply in chat: ${String(d.chatUrl)}`,
  },
  ig: {
    subject: "Ị natara ozi ọhụrụ na OBIGBO",
    body: (d: Record<string, unknown>) =>
      `<p>Ndewo ${escHtml(d.name)},</p>
       <p><strong>${escHtml(d.senderName)}</strong> zigara gị ozi:</p>
       <blockquote style="border-left:3px solid #D4631F;margin:16px 0;padding:8px 16px;color:#444;font-style:italic">${escHtml(d.messagePreview)}</blockquote>
       <p><a href="${escHtml(d.chatUrl)}" style="color:#D4631F;font-weight:600">Zaghachi na chat →</a></p>`,
    text: (d: Record<string, unknown>) =>
      `Ndewo ${String(d.name)},\n\n${String(d.senderName)} zigara gị ozi:\n\n"${String(d.messagePreview)}"\n\nZaghachi na chat: ${String(d.chatUrl)}`,
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
