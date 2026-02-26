import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

const COPY = {
  en: {
    subject: "Important security notice from OBIGBO",
    body: (d: Record<string, unknown>) =>
      `<p>Hello ${escHtml(d.name)},</p>
       <p><strong>Important Security Notice</strong></p>
       <p>We are writing to inform you of a security incident that may affect your OBIGBO account.</p>
       <p><strong>Incident time:</strong> ${escHtml(d.incidentTimestamp)}</p>
       <p><strong>Details:</strong></p>
       <blockquote style="border-left:4px solid #D4631F;margin:16px 0;padding:12px 16px;background:#faf8f6;color:#333">
         ${escHtml(d.notificationMessage)}
       </blockquote>
       <p><strong>Recommended actions:</strong></p>
       <ul style="padding-left:20px;line-height:1.8">
         <li>Change your OBIGBO password immediately</li>
         <li>Review your recent account activity</li>
         <li>Enable two-factor authentication if not already enabled</li>
         <li>Contact us at support@igbo.global if you notice any suspicious activity</li>
       </ul>
       <p style="color:#666;font-size:14px">We take the security of your data seriously and apologize for any inconvenience this may cause.</p>`,
    text: (d: Record<string, unknown>) =>
      `Hello ${String(d.name)},\n\nIMPORTANT SECURITY NOTICE\n\nWe are writing to inform you of a security incident that may affect your OBIGBO account.\n\nIncident time: ${String(d.incidentTimestamp)}\n\nDetails: ${String(d.notificationMessage)}\n\nRecommended actions:\n1. Change your OBIGBO password immediately\n2. Review your recent account activity\n3. Enable two-factor authentication if not already enabled\n4. Contact us at support@igbo.global if you notice any suspicious activity`,
  },
  ig: {
    subject: "Ozi nchedo dị mkpa sitere na OBIGBO",
    body: (d: Record<string, unknown>) =>
      `<p>Ndewo ${escHtml(d.name)},</p>
       <p><strong>Ozi Nchedo Dị Mkpa</strong></p>
       <p>Anyị na-ede ọkwa a ka anyị wee gwa gị maka ihe omume nchedo nke nwere ike metụta akaụntụ OBIGBO gị.</p>
       <p><strong>Oge ihe omume:</strong> ${escHtml(d.incidentTimestamp)}</p>
       <p><strong>Nkọwa:</strong></p>
       <blockquote style="border-left:4px solid #D4631F;margin:16px 0;padding:12px 16px;background:#faf8f6;color:#333">
         ${escHtml(d.notificationMessage)}
       </blockquote>
       <p><strong>Ihe anyị na-atụ aro ka ị mee:</strong></p>
       <ul style="padding-left:20px;line-height:1.8">
         <li>Gbanwee okwuntughe OBIGBO gị ozugbo</li>
         <li>Lelee omume akaụntụ gị ndị ọhụrụ</li>
         <li>Kwado njikwa abụọ-oge ọ bụrụ na ị emebeghị ya</li>
         <li>Kpọtụrụ anyị na support@igbo.global ọ bụrụ na ị hụ omume ọ bụla dị adịghị mma</li>
       </ul>
       <p style="color:#666;font-size:14px">Anyị na-ewere nchedo data gị dị mkpa ma e ji obi mgbu maka nsogbu ọ bụla nke nke a nwere ike ịkpata.</p>`,
    text: (d: Record<string, unknown>) =>
      `Ndewo ${String(d.name)},\n\nOZI NCHEDO DỊ MKPA\n\nAnyị na-ede ọkwa a ka anyị gwa gị maka ihe omume nchedo nke nwere ike metụta akaụntụ OBIGBO gị.\n\nOge ihe omume: ${String(d.incidentTimestamp)}\n\nNkọwa: ${String(d.notificationMessage)}\n\nIhe anyị na-atụ aro:\n1. Gbanwee okwuntughe OBIGBO gị ozugbo\n2. Lelee omume akaụntụ gị ndị ọhụrụ\n3. Kwado njikwa abụọ-oge ọ bụrụ na ị emebeghị ya\n4. Kpọtụrụ anyị na support@igbo.global ọ bụrụ na ị hụ omume ọ bụla dị adịghị mma`,
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
