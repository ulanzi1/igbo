import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

interface TemplateData {
  jobTitle: unknown;
  companyName: unknown;
  reason?: unknown; // optional — admin may not provide a reason
}

const COPY = {
  en: {
    subject: (d: TemplateData) => `Your job posting ${String(d.jobTitle)} was not approved`,
    body: (d: TemplateData) => {
      const reasonSection =
        d.reason != null && String(d.reason).trim()
          ? `<p><strong>Reason:</strong> ${escHtml(d.reason)}</p>`
          : "";
      return `<p>Hello ${escHtml(d.companyName)},</p>
       <p>We're sorry to inform you that your job posting <strong>${escHtml(d.jobTitle)}</strong> has not been approved at this time.</p>
       ${reasonSection}<p>If you believe this was an error or would like further clarification, please contact our support team. You are welcome to revise and resubmit a new posting that meets our guidelines.</p>`;
    },
    text: (d: TemplateData) => {
      const reasonLine =
        d.reason != null && String(d.reason).trim() ? `\nReason: ${String(d.reason)}` : "";
      return `Hello ${String(d.companyName)},\n\nYour job posting "${String(d.jobTitle)}" was not approved.${reasonLine}\n\nIf you have questions, please contact our support team.`;
    },
  },
  ig: {
    subject: (d: TemplateData) => `Ntinye ọrụ gị ${String(d.jobTitle)} ekwenyeghị`,
    body: (d: TemplateData) => {
      const reasonSection =
        d.reason != null && String(d.reason).trim()
          ? `<p><strong>Ihe kpatara:</strong> ${escHtml(d.reason)}</p>`
          : "";
      return `<p>Ndewo ${escHtml(d.companyName)},</p>
       <p>Anyị dị ọchịchọ ịkọ gị na ntinye ọrụ gị <strong>${escHtml(d.jobTitle)}</strong> ekwenyeghị n'oge a.</p>
       ${reasonSection}<p>Ọ bụrụ na ị chere na ọ bụ mperi ma ọ bụ ị chọọ nkọwa ọzọ, biko kpọtụrụ ndị otu nkwado anyị. Ị nwere ike ịmegharịa ma zipu ntinye ọhụrụ nke na-arụ ọrụ na usoro anyị.</p>`;
    },
    text: (d: TemplateData) => {
      const reasonLine =
        d.reason != null && String(d.reason).trim() ? `\nIhe kpatara: ${String(d.reason)}` : "";
      return `Ndewo ${String(d.companyName)},\n\nNtinye ọrụ gị "${String(d.jobTitle)}" ekwenyeghị.${reasonLine}\n\nỌ bụrụ na ị nwere ajụjụ, biko kpọtụrụ ndị otu nkwado anyị.`;
    },
  },
} as const;

export function render(data: Record<string, unknown>, locale: "en" | "ig"): EmailTemplateResult {
  const lang = locale === "ig" ? "ig" : "en";
  const c = COPY[lang];
  const d = data as unknown as TemplateData;
  const portalBaseUrl = String(data.portalBaseUrl ?? "");
  const unsubscribeUrl = portalBaseUrl ? `${portalBaseUrl}/settings/notifications` : undefined;
  return {
    subject: c.subject(d),
    html: renderBase(c.body(d), lang, unsubscribeUrl),
    text: c.text(d),
  };
}
