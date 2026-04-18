import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

interface DigestJob {
  title: unknown;
  company: unknown;
  location: unknown;
  detailUrl: unknown;
}

interface DigestSearch {
  name: unknown;
  newJobs: DigestJob[];
}

interface DigestData {
  seekerName: unknown;
  searches: DigestSearch[];
}

const COPY = {
  en: {
    subject: (count: number) =>
      `${count} new job${count === 1 ? "" : "s"} matching your saved searches`,
    greeting: (name: unknown) => `Hello ${escHtml(name)},`,
    intro: "We found new job postings that match your saved searches. Here's a summary:",
    viewJob: "View Job",
    noTitle: "Untitled Position",
    noCompany: "Unknown Company",
    outro: "Log in to your portal to manage your saved searches and alerts.",
    text: (d: DigestData) => {
      const sections = d.searches.map((s) => {
        const jobs = s.newJobs
          .map(
            (j) =>
              `  • ${String(j.title ?? "Untitled")} — ${String(j.company ?? "Unknown")}${j.location ? ` (${String(j.location)})` : ""}\n    ${String(j.detailUrl ?? "")}`,
          )
          .join("\n");
        return `${String(s.name ?? "Search")}:\n${jobs}`;
      });
      return `Hello ${String(d.seekerName ?? "")},\n\nNew jobs matching your saved searches:\n\n${sections.join("\n\n")}\n\nLog in to manage your saved searches and alerts.`;
    },
  },
  ig: {
    subject: (count: number) => `${count} ọrụ ọhụrụ dabara n'achọchaa gị ezipụtara`,
    greeting: (name: unknown) => `Ndewo ${escHtml(name)},`,
    intro: "Achọtara anyị ọrụ ọhụrụ dabara n'achọchaa gị ezipụtara. Lee nchịkọta:",
    viewJob: "Lee Ọrụ",
    noTitle: "Ọrụ Na-enweghị Aha",
    noCompany: "Ụlọ Ọrụ Amaghị",
    outro: "Banye n'ọdụ ụlọ gị iji chịkọta achọchaa ezipụtara gị na ịkpọ ọkụ.",
    text: (d: DigestData) => {
      const sections = d.searches.map((s) => {
        const jobs = s.newJobs
          .map(
            (j) =>
              `  • ${String(j.title ?? "Ọrụ Na-enweghị Aha")} — ${String(j.company ?? "Ụlọ Ọrụ Amaghị")}${j.location ? ` (${String(j.location)})` : ""}\n    ${String(j.detailUrl ?? "")}`,
          )
          .join("\n");
        return `${String(s.name ?? "Achọchaa")}:\n${jobs}`;
      });
      return `Ndewo ${String(d.seekerName ?? "")},\n\nỌrụ ọhụrụ dabara n'achọchaa gị:\n\n${sections.join("\n\n")}\n\nBanye iji chịkọta achọchaa gị.`;
    },
  },
} as const;

function renderJobRow(job: DigestJob, c: (typeof COPY)["en"]): string {
  const title = String(job.title ?? c.noTitle);
  const company = String(job.company ?? c.noCompany);
  const location = job.location ? ` &mdash; ${escHtml(job.location)}` : "";
  const url = String(job.detailUrl ?? "#");
  return `<li style="margin-bottom:12px">
      <strong>${escHtml(title)}</strong> at ${escHtml(company)}${location}<br>
      <a href="${escHtml(url)}" style="color:#D4631F;font-weight:600">${c.viewJob}</a>
    </li>`;
}

function renderSearchSection(search: DigestSearch, c: (typeof COPY)["en"]): string {
  const name = String(search.name ?? "Search");
  const jobs = search.newJobs.map((j) => renderJobRow(j, c)).join("\n");
  return `<h3 style="margin:20px 0 8px;font-size:16px;color:#1a1a1a">${escHtml(name)}</h3>
    <ul style="padding-left:0;list-style:none;margin:0">${jobs}</ul>`;
}

export function render(data: Record<string, unknown>, locale: "en" | "ig"): EmailTemplateResult {
  const lang = locale === "ig" ? "ig" : "en";
  const c = COPY[lang];
  const d = data as unknown as DigestData;

  const totalJobs = d.searches.reduce((sum, s) => sum + s.newJobs.length, 0);

  const body = `
    <p>${c.greeting(d.seekerName)}</p>
    <p>${c.intro}</p>
    ${d.searches.map((s) => renderSearchSection(s, c)).join("\n")}
    <p style="margin-top:24px;color:#555">${c.outro}</p>
  `;

  return {
    subject: c.subject(totalJobs),
    html: renderBase(body, lang),
    text: c.text(d),
  };
}
