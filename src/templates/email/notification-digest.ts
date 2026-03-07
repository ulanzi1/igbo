import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

const UNSUBSCRIBE_URL = "/settings/notifications";

interface DigestNotification {
  type: string;
  title: string;
  body: string;
  link?: string | null;
}

const TYPE_LABELS: Record<string, { en: string; ig: string }> = {
  message: { en: "Messages", ig: "Ozi" },
  mention: { en: "Mentions", ig: "Ọkpụkpụ" },
  group_activity: { en: "Group Activity", ig: "Ọrụ Otu" },
  event_reminder: { en: "Events", ig: "Mmemme" },
  post_interaction: { en: "Post Interactions", ig: "Mmekọrịta Ifiokwu" },
  admin_announcement: { en: "Announcements", ig: "Mkpọsa" },
};

function renderNotificationItem(n: DigestNotification, locale: "en" | "ig"): string {
  const label = TYPE_LABELS[n.type]?.[locale] ?? TYPE_LABELS[n.type]?.en ?? n.type;
  const linkHtml = n.link
    ? `<a href="${escHtml(n.link)}" style="color:#D4631F;font-size:12px">View →</a>`
    : "";
  return `<tr>
    <td style="padding:8px 0;border-bottom:1px solid #f0f0f0">
      <span style="font-size:11px;font-weight:600;color:#888;text-transform:uppercase">${escHtml(label)}</span><br>
      <strong style="font-size:14px">${escHtml(n.title)}</strong><br>
      <span style="font-size:13px;color:#555">${escHtml(n.body)}</span>
      ${linkHtml}
    </td>
  </tr>`;
}

const COPY = {
  en: {
    subject: (count: number) =>
      `Your OBIGBO digest – ${count} notification${count === 1 ? "" : "s"}`,
    heading: "Here's what you missed",
    manageText: "Manage your notification preferences",
  },
  ig: {
    subject: (count: number) => `Ndekọ OBIGBO gị – ọkwa ${count}`,
    heading: "Nke ị hapụrụ",
    manageText: "Jikwaa nhọrọ ọkwa gị",
  },
} as const;

export function render(data: Record<string, unknown>, locale: "en" | "ig"): EmailTemplateResult {
  const lang = locale === "ig" ? "ig" : "en";
  const c = COPY[lang];
  const notifications = (data.notifications as DigestNotification[]) ?? [];
  const count = (data.count as number) ?? notifications.length;

  const rows = notifications.map((n) => renderNotificationItem(n, lang)).join("");
  const body = `
    <h2 style="margin-top:0;font-size:20px;color:#1a1a1a">${c.heading}</h2>
    <table style="width:100%;border-collapse:collapse">
      <tbody>${rows}</tbody>
    </table>
    <p style="margin-top:16px;font-size:12px;color:#888">
      <a href="${UNSUBSCRIBE_URL}" style="color:#D4631F">${c.manageText}</a>
    </p>
  `;

  const text = notifications
    .map((n) => `[${n.type}] ${n.title}: ${n.body}${n.link ? " — " + n.link : ""}`)
    .join("\n");

  return {
    subject: c.subject(count),
    html: renderBase(body, lang, UNSUBSCRIBE_URL),
    text,
  };
}
