import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

const COPY = {
  en: {
    subject: "OBIGBO account deletion requested",
    body: (d: Record<string, unknown>) => {
      const deletionDate = new Date(String(d.scheduledDeletionAt)).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      return `<p>Hello ${escHtml(d.name)},</p>
       <p>We have received a request to delete your OBIGBO account. Your account is scheduled for permanent deletion on <strong>${escHtml(deletionDate)}</strong>.</p>
       <p>If you change your mind, you can cancel the deletion by clicking the button below:</p>
       <p style="text-align:center;margin:32px 0">
         <a href="${escHtml(d.cancellationUrl)}"
            style="background:#D4631F;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block">
           Cancel Account Deletion
         </a>
       </p>
       <p style="color:#666;font-size:14px">Cancellation token: ${escHtml(d.cancellationToken)}</p>
       <p style="color:#666;font-size:14px">If you did not request account deletion, please contact us immediately at support@igbo.global.</p>`;
    },
    text: (d: Record<string, unknown>) => {
      const deletionDate = new Date(String(d.scheduledDeletionAt)).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      return `Hello ${String(d.name)},\n\nYour OBIGBO account is scheduled for deletion on ${deletionDate}.\n\nTo cancel deletion, visit:\n${String(d.cancellationUrl)}\n\nIf you did not request account deletion, contact us at support@igbo.global.`;
    },
  },
  ig: {
    subject: "Arịọla ihichapụ akaụntụ OBIGBO gị",
    body: (d: Record<string, unknown>) => {
      const deletionDate = new Date(String(d.scheduledDeletionAt)).toLocaleDateString("en-GB", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      return `<p>Ndewo ${escHtml(d.name)},</p>
       <p>Anyị natara arịọ ihichapụ akaụntụ OBIGBO gị. A tọrọ ntọala ihichapụ akaụntụ gị kpamkpam na <strong>${escHtml(deletionDate)}</strong>.</p>
       <p>Ọ bụrụ na ị gbanwee echiche gị, ị nwere ike ikwụsị ihichapụ site na ịpị bọtịn dị n'okpuru:</p>
       <p style="text-align:center;margin:32px 0">
         <a href="${escHtml(d.cancellationUrl)}"
            style="background:#D4631F;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block">
           Kwụsị Ihichapụ Akaụntụ
         </a>
       </p>
       <p style="color:#666;font-size:14px">Token ikwụsị: ${escHtml(d.cancellationToken)}</p>
       <p style="color:#666;font-size:14px">Ọ bụrụ na ị arịọghị ihichapụ akaụntụ, biko kpọtụrụ anyị ozugbo na support@igbo.global.</p>`;
    },
    text: (d: Record<string, unknown>) => {
      const deletionDate = new Date(String(d.scheduledDeletionAt)).toLocaleDateString("en-GB", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      return `Ndewo ${String(d.name)},\n\nA tọrọ ntọala ihichapụ akaụntụ OBIGBO gị na ${deletionDate}.\n\nIhichapụ kwụsị, gaa:\n${String(d.cancellationUrl)}\n\nỌ bụrụ na ị arịọghị ihichapụ akaụntụ, kpọtụrụ anyị na support@igbo.global.`;
    },
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
