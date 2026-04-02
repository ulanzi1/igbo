import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

const UNSUBSCRIBE_URL = "/settings/notifications";

// NOTE: This template is created but NOT wired in getEmailTemplateForType() in notification-service.ts.
// It will be activated in Story 9.4 when member.followed can be configured for email
// via per-type notification preferences.

const COPY = {
  en: {
    subject: "Someone started following you on OBIGBO",
    body: (d: Record<string, unknown>) =>
      `<p>Hello ${escHtml(d.name)},</p>
       <p><strong>${escHtml(d.followerName)}</strong> started following you on OBIGBO.</p>
       <p><a href="${escHtml(d.profileUrl)}" style="color:#D4631F;font-weight:600">View their profile →</a></p>`,
    text: (d: Record<string, unknown>) =>
      `Hello ${String(d.name)},\n\n${String(d.followerName)} started following you on OBIGBO.\n\nView their profile: ${String(d.profileUrl)}`,
  },
  ig: {
    subject: "Onye amalitego iso gị ụzọ na OBIGBO",
    body: (d: Record<string, unknown>) =>
      `<p>Ndewo ${escHtml(d.name)},</p>
       <p><strong>${escHtml(d.followerName)}</strong> amalitego iso gị ụzọ na OBIGBO.</p>
       <p><a href="${escHtml(d.profileUrl)}" style="color:#D4631F;font-weight:600">Hụ profaịlụ ha →</a></p>`,
    text: (d: Record<string, unknown>) =>
      `Ndewo ${String(d.name)},\n\n${String(d.followerName)} amalitego iso gị ụzọ na OBIGBO.\n\nHụ profaịlụ ha: ${String(d.profileUrl)}`,
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
