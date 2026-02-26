import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

const COPY = {
  en: {
    subject: "Welcome to OBIGBO — you're in!",
    body: (d: Record<string, unknown>) =>
      `<p>Hello ${escHtml(d.name)},</p>
       <p>You've completed your OBIGBO onboarding — welcome to the community!</p>
       <p>Here are some great ways to get started:</p>
       <ul style="padding-left:20px;line-height:1.8">
         <li><a href="${escHtml(d.dashboardUrl)}" style="color:#D4631F">Visit your dashboard</a></li>
         <li><a href="${escHtml(d.groupsUrl)}" style="color:#D4631F">Explore community groups</a></li>
         <li><a href="${escHtml(d.membersUrl)}" style="color:#D4631F">Discover other members</a></li>
       </ul>
       <p>We're glad you're here. Welcome to OBIGBO!</p>`,
    text: (d: Record<string, unknown>) =>
      `Hello ${String(d.name)},\n\nYou've completed your OBIGBO onboarding — welcome to the community!\n\nGet started:\n- Dashboard: ${String(d.dashboardUrl)}\n- Groups: ${String(d.groupsUrl)}\n- Members: ${String(d.membersUrl)}\n\nWe're glad you're here. Welcome to OBIGBO!`,
  },
  ig: {
    subject: "Nnọ na OBIGBO — ị bụ onye otu!",
    body: (d: Record<string, unknown>) =>
      `<p>Ndewo ${escHtml(d.name)},</p>
       <p>Ị mechara nhọpụta OBIGBO gị — nnọ n'otu anyị!</p>
       <p>Nke a bụ ụzọ dị mma ị pụta ije:</p>
       <ul style="padding-left:20px;line-height:1.8">
         <li><a href="${escHtml(d.dashboardUrl)}" style="color:#D4631F">Gaa na dashboard gị</a></li>
         <li><a href="${escHtml(d.groupsUrl)}" style="color:#D4631F">Chọpụta otu ndị ọha</a></li>
         <li><a href="${escHtml(d.membersUrl)}" style="color:#D4631F">Hụ ndị otu ọzọ</a></li>
       </ul>
       <p>Anyị na-atọ ụtọ nwere gị. Nnọ na OBIGBO!</p>`,
    text: (d: Record<string, unknown>) =>
      `Ndewo ${String(d.name)},\n\nỊ mechara nhọpụta OBIGBO gị — nnọ n'otu anyị!\n\nPụta ije:\n- Dashboard: ${String(d.dashboardUrl)}\n- Otu ndị ọha: ${String(d.groupsUrl)}\n- Ndị otu: ${String(d.membersUrl)}\n\nAnyị na-atọ ụtọ nwere gị. Nnọ na OBIGBO!`,
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
