import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

const COPY = {
  en: {
    subject: "Your OBIGBO data export is ready",
    body: (d: Record<string, unknown>) => {
      const expiresDate = new Date(String(d.expiresAt)).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      return `<p>Hello ${escHtml(d.name)},</p>
       <p>Your OBIGBO data export is ready for download. Click the button below to download your data:</p>
       <p style="text-align:center;margin:32px 0">
         <a href="${escHtml(d.downloadUrl)}"
            style="background:#D4631F;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block">
           Download My Data
         </a>
       </p>
       <p>This download link expires on <strong>${escHtml(expiresDate)}</strong> (48 hours from now).</p>
       <p style="color:#666;font-size:14px">Download token: ${escHtml(d.downloadToken)}</p>
       <p style="color:#666;font-size:14px">If you did not request a data export, please contact us at support@igbo.global.</p>`;
    },
    text: (d: Record<string, unknown>) => {
      const expiresDate = new Date(String(d.expiresAt)).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      return `Hello ${String(d.name)},\n\nYour OBIGBO data export is ready.\n\nDownload your data: ${String(d.downloadUrl)}\n\nThis link expires on ${expiresDate} (48 hours).\n\nIf you did not request a data export, contact us at support@igbo.global.`;
    },
  },
  ig: {
    subject: "Mbupu data OBIGBO gị dị njikere",
    body: (d: Record<string, unknown>) => {
      const expiresDate = new Date(String(d.expiresAt)).toLocaleDateString("en-GB", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      return `<p>Ndewo ${escHtml(d.name)},</p>
       <p>Mbupu data OBIGBO gị dị njikere maka nbudata. Pịa bọtịn dị n'okpuru ka ị budata data gị:</p>
       <p style="text-align:center;margin:32px 0">
         <a href="${escHtml(d.downloadUrl)}"
            style="background:#D4631F;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block">
           Budata Data M
         </a>
       </p>
       <p>Njikọ nbudata a ga-akwụsị na <strong>${escHtml(expiresDate)}</strong> (awa 48 site ugbu a).</p>
       <p style="color:#666;font-size:14px">Token nbudata: ${escHtml(d.downloadToken)}</p>
       <p style="color:#666;font-size:14px">Ọ bụrụ na ị arịọghị mbupu data, biko kpọtụrụ anyị na support@igbo.global.</p>`;
    },
    text: (d: Record<string, unknown>) => {
      const expiresDate = new Date(String(d.expiresAt)).toLocaleDateString("en-GB", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      return `Ndewo ${String(d.name)},\n\nMbupu data OBIGBO gị dị njikere.\n\nBudata data gị: ${String(d.downloadUrl)}\n\nNjikọ a ga-akwụsị na ${expiresDate} (awa 48).\n\nỌ bụrụ na ị arịọghị mbupu data, kpọtụrụ anyị na support@igbo.global.`;
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
