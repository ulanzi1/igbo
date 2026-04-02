import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

const UNSUBSCRIBE_URL = "/settings/notifications";

const COPY = {
  en: {
    subject: "You have an upcoming event on OBIGBO",
    body: (d: Record<string, unknown>) =>
      `<p>Hello ${escHtml(d.name)},</p>
       <p>This is a reminder that you have an upcoming event: <strong>${escHtml(d.eventTitle)}</strong>.</p>
       <p style="color:#666;font-size:14px">Starting: ${escHtml(d.startTime)}</p>
       <p><a href="${escHtml(d.eventUrl)}" style="color:#D4631F;font-weight:600">View event details →</a></p>`,
    text: (d: Record<string, unknown>) =>
      `Hello ${String(d.name)},\n\nThis is a reminder that you have an upcoming event: "${String(d.eventTitle)}".\n\nStarting: ${String(d.startTime)}\n\nView event details: ${String(d.eventUrl)}`,
  },
  ig: {
    subject: "Ị nwere mmemme na-abịa na OBIGBO",
    body: (d: Record<string, unknown>) =>
      `<p>Ndewo ${escHtml(d.name)},</p>
       <p>Nke a bụ ihe ncheta na ị nwere mmemme na-abịa: <strong>${escHtml(d.eventTitle)}</strong>.</p>
       <p style="color:#666;font-size:14px">Mmalite: ${escHtml(d.startTime)}</p>
       <p><a href="${escHtml(d.eventUrl)}" style="color:#D4631F;font-weight:600">Hụ nkọwa mmemme →</a></p>`,
    text: (d: Record<string, unknown>) =>
      `Ndewo ${String(d.name)},\n\nNke a bụ ihe ncheta na ị nwere mmemme na-abịa: "${String(d.eventTitle)}".\n\nMmalite: ${String(d.startTime)}\n\nHụ nkọwa mmemme: ${String(d.eventUrl)}`,
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
