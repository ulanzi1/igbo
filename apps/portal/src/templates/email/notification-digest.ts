import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

interface DigestItem {
  title: string;
  body: string;
  link: string | null;
}

interface DigestData {
  seekerName: unknown;
  recommendations: DigestItem[];
  savedSearches: DigestItem[];
  activity: DigestItem[];
  preferencesUrl: unknown;
}

const COPY = {
  en: {
    subject: (count: number) => `Your job digest — ${count} new item${count === 1 ? "" : "s"}`,
    greeting: (name: unknown) => `Hello ${escHtml(name)},`,
    intro: "Here's what's new since your last digest:",
    sectionRecommendations: "New Job Recommendations",
    sectionSavedSearches: "Saved Search Results",
    sectionActivitySummary: "Activity Summary",
    viewAll: "View All",
    managePreferences: "Manage your notification preferences",
    text: (d: DigestData): string => {
      const lines: string[] = [
        `Hello ${String(d.seekerName ?? "")},`,
        "",
        "Here's what's new since your last digest:",
      ];
      if (d.recommendations.length > 0) {
        lines.push("", "New Job Recommendations:");
        for (const item of d.recommendations) {
          lines.push(`  • ${String(item.title ?? "")} — ${String(item.link ?? "")}`);
        }
      }
      if (d.savedSearches.length > 0) {
        lines.push("", "Saved Search Results:");
        for (const item of d.savedSearches) {
          lines.push(`  • ${String(item.title ?? "")} — ${String(item.link ?? "")}`);
        }
      }
      if (d.activity.length > 0) {
        lines.push("", "Activity Summary:");
        for (const item of d.activity) {
          lines.push(`  • ${String(item.title ?? "")} — ${String(item.link ?? "")}`);
        }
      }
      lines.push("", `Manage preferences: ${String(d.preferencesUrl ?? "")}`);
      return lines.join("\n");
    },
  },
  ig: {
    subject: (count: number) => `Nkwurịta ọrụ gị — ihe ${count} ọhụrụ`,
    greeting: (name: unknown) => `Ndewo ${escHtml(name)},`,
    intro: "Lee ihe ọhụrụ kemgbe nkwurịta ikpeazụ gị:",
    sectionRecommendations: "Ntụzi Ọrụ Ọhụrụ",
    sectionSavedSearches: "Nsonaazụ Achọchaa Ezipụtara",
    sectionActivitySummary: "Nchịkọta Ọrụ",
    viewAll: "Lee Ha Niile",
    managePreferences: "Chịkọta nhọrọ ọkwa ntị gị",
    text: (d: DigestData): string => {
      const lines: string[] = [
        `Ndewo ${String(d.seekerName ?? "")},`,
        "",
        "Lee ihe ọhụrụ kemgbe nkwurịta ikpeazụ gị:",
      ];
      if (d.recommendations.length > 0) {
        lines.push("", "Ntụzi Ọrụ Ọhụrụ:");
        for (const item of d.recommendations) {
          lines.push(`  • ${String(item.title ?? "")} — ${String(item.link ?? "")}`);
        }
      }
      if (d.savedSearches.length > 0) {
        lines.push("", "Nsonaazụ Achọchaa Ezipụtara:");
        for (const item of d.savedSearches) {
          lines.push(`  • ${String(item.title ?? "")} — ${String(item.link ?? "")}`);
        }
      }
      if (d.activity.length > 0) {
        lines.push("", "Nchịkọta Ọrụ:");
        for (const item of d.activity) {
          lines.push(`  • ${String(item.title ?? "")} — ${String(item.link ?? "")}`);
        }
      }
      lines.push("", `Chịkọta nhọrọ: ${String(d.preferencesUrl ?? "")}`);
      return lines.join("\n");
    },
  },
};

function renderItemRow(item: DigestItem, viewLabel: string, portalBaseUrl: string): string {
  const title = escHtml(item.title ?? "");
  const body = escHtml(item.body ?? "");
  const linkStr = String(item.link ?? "");
  const href =
    linkStr.startsWith("/") && !linkStr.startsWith("//")
      ? `${portalBaseUrl}${escHtml(linkStr)}`
      : linkStr
        ? "#"
        : "#";
  return `<li style="margin-bottom:12px">
    <strong>${title}</strong><br>
    <span style="color:#555;font-size:14px">${body}</span><br>
    <a href="${href}" style="color:#D4631F;font-weight:600;font-size:14px">${viewLabel} &rarr;</a>
  </li>`;
}

function renderSection(
  heading: string,
  items: DigestItem[],
  viewAllHref: string,
  viewAllLabel: string,
  viewItemLabel: string,
  portalBaseUrl: string,
): string {
  if (items.length === 0) return "";
  const rows = items.map((item) => renderItemRow(item, viewItemLabel, portalBaseUrl)).join("\n");
  return `
    <h2 style="margin:28px 0 8px;font-size:18px;color:#D4631F;border-bottom:2px solid #f0ebe5;padding-bottom:8px">${escHtml(heading)}</h2>
    <ul style="padding-left:0;list-style:none;margin:0 0 8px">
      ${rows}
    </ul>
    <p style="margin:0 0 24px">
      <a href="${escHtml(viewAllHref)}" style="color:#D4631F;font-size:13px;font-weight:600">${escHtml(viewAllLabel)} &rarr;</a>
    </p>`;
}

export function render(data: Record<string, unknown>, locale: "en" | "ig"): EmailTemplateResult {
  const lang = locale === "ig" ? "ig" : "en";
  const c = COPY[lang];
  const d = data as unknown as DigestData;

  const portalBaseUrl =
    typeof process !== "undefined"
      ? (process.env.NEXT_PUBLIC_PORTAL_URL ?? "https://portal.igbo.global") // ci-allow-process-env
      : "https://portal.igbo.global";

  const recommendations = d.recommendations ?? [];
  const savedSearches = d.savedSearches ?? [];
  const activity = d.activity ?? [];
  const totalItems = recommendations.length + savedSearches.length + activity.length;
  const preferencesUrl = String(d.preferencesUrl ?? `${portalBaseUrl}/settings/notifications`);

  const body = `
    <p>${c.greeting(d.seekerName)}</p>
    <p style="color:#555">${c.intro}</p>
    ${renderSection(
      c.sectionRecommendations,
      recommendations,
      `${portalBaseUrl}/jobs`,
      c.viewAll,
      c.viewAll,
      portalBaseUrl,
    )}
    ${renderSection(
      c.sectionSavedSearches,
      savedSearches,
      `${portalBaseUrl}/saved-searches`,
      c.viewAll,
      c.viewAll,
      portalBaseUrl,
    )}
    ${renderSection(
      c.sectionActivitySummary,
      activity,
      `${portalBaseUrl}/applications`,
      c.viewAll,
      c.viewAll,
      portalBaseUrl,
    )}
    <hr style="border:0;border-top:1px solid #f0ebe5;margin:24px 0">
    <p style="font-size:13px;color:#888">
      <a href="${escHtml(preferencesUrl)}" style="color:#D4631F">${c.managePreferences}</a>
    </p>
  `;

  return {
    subject: c.subject(totalItems),
    html: renderBase(body, lang, preferencesUrl),
    text: c.text(d),
  };
}
