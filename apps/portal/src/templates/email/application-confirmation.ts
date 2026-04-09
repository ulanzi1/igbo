import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

interface ConfirmationData {
  seekerName: unknown;
  jobTitle: unknown;
  companyName: unknown;
  submittedAt: unknown; // ISO string or Date
  trackingUrl: unknown;
}

const COPY = {
  en: {
    subject: (d: ConfirmationData) =>
      `Application Submitted — ${String(d.jobTitle)} at ${String(d.companyName)}`,
    body: (d: ConfirmationData) => {
      const dateStr = d.submittedAt
        ? new Date(String(d.submittedAt)).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : "";
      return `<p>Hello ${escHtml(d.seekerName)},</p>
       <p>Your application for <strong>${escHtml(d.jobTitle)}</strong> at <strong>${escHtml(d.companyName)}</strong> has been successfully submitted${dateStr ? ` on ${escHtml(dateStr)}` : ""}.</p>
       <p>The employer will review your application. You'll be notified of any status changes.</p>
       <p><a href="${escHtml(d.trackingUrl)}" style="display:inline-block;background:#D4631F;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Track Your Application</a></p>`;
    },
    text: (d: ConfirmationData) => {
      const dateStr = d.submittedAt
        ? new Date(String(d.submittedAt)).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : "";
      return `Hello ${String(d.seekerName)},\n\nYour application for ${String(d.jobTitle)} at ${String(d.companyName)} has been successfully submitted${dateStr ? ` on ${dateStr}` : ""}.\n\nThe employer will review your application. You'll be notified of any status changes.\n\nTrack your application: ${String(d.trackingUrl)}`;
    },
  },
  ig: {
    subject: (d: ConfirmationData) =>
      `Arịọ Ezigara — ${String(d.jobTitle)} na ${String(d.companyName)}`,
    body: (d: ConfirmationData) => {
      const dateStr = d.submittedAt
        ? new Date(String(d.submittedAt)).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : "";
      return `<p>Ndewo ${escHtml(d.seekerName)},</p>
       <p>Arịọ gị maka <strong>${escHtml(d.jobTitle)}</strong> na <strong>${escHtml(d.companyName)}</strong> ezigara nke ọma${dateStr ? ` na ${escHtml(dateStr)}` : ""}.</p>
       <p>Onye ọrụ ga-elele arịọ gị. A ga-ịkọ gị maka mgbanwe ọ bụla n'ọnọdụ.</p>
       <p><a href="${escHtml(d.trackingUrl)}" style="display:inline-block;background:#D4631F;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Soro Arịọ Gị</a></p>`;
    },
    text: (d: ConfirmationData) => {
      const dateStr = d.submittedAt
        ? new Date(String(d.submittedAt)).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : "";
      return `Ndewo ${String(d.seekerName)},\n\nArịọ gị maka ${String(d.jobTitle)} na ${String(d.companyName)} ezigara nke ọma${dateStr ? ` na ${dateStr}` : ""}.\n\nOnye ọrụ ga-elele arịọ gị. A ga-ịkọ gị maka mgbanwe ọ bụla n'ọnọdụ.\n\nSoro arịọ gị: ${String(d.trackingUrl)}`;
    },
  },
} as const;

export function render(data: Record<string, unknown>, locale: "en" | "ig"): EmailTemplateResult {
  const lang = locale === "ig" ? "ig" : "en";
  const c = COPY[lang];
  const d = data as unknown as ConfirmationData;
  return {
    subject: c.subject(d),
    html: renderBase(c.body(d), lang),
    text: c.text(d),
  };
}
