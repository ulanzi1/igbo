import "server-only";
import type { ScreeningFlag, ScreeningInput, ScreeningContext } from "../types";
import { stripHtmlToText, normalizeForMatching } from "../text-utils";

function escapeRegex(phrase: string): string {
  return phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildPhraseRegex(phrase: string): RegExp {
  const normalized = normalizeForMatching(phrase);
  const escaped = escapeRegex(normalized);
  return new RegExp(`\\b${escaped}\\b`, "iu");
}

function scanField(
  text: string,
  phrase: string,
  regex: RegExp,
  fieldName: string,
): ScreeningFlag | null {
  const normalized = normalizeForMatching(text);
  if (regex.test(normalized)) {
    return {
      rule_id: "blocklist_hit",
      message: `Prohibited phrase detected in ${fieldName}: "${phrase}"`,
      severity: "high",
      field: fieldName,
      match: phrase,
    };
  }
  return null;
}

export function blocklistRule(
  input: ScreeningInput,
  ctx: ScreeningContext = { blocklistPhrases: [] },
): ScreeningFlag[] {
  if (ctx.blocklistPhrases.length === 0) return [];

  const flags: ScreeningFlag[] = [];

  const titleText = input.title ?? "";
  const descText = stripHtmlToText(input.descriptionHtml);
  const descIgboText = stripHtmlToText(input.descriptionIgboHtml);

  for (const phrase of ctx.blocklistPhrases) {
    const regex = buildPhraseRegex(phrase);

    // Check title
    const titleFlag = scanField(titleText, phrase, regex, "title");
    if (titleFlag) {
      flags.push(titleFlag);
      continue; // one flag per phrase is enough
    }

    // Check English description
    const descFlag = scanField(descText, phrase, regex, "description");
    if (descFlag) {
      flags.push(descFlag);
      continue;
    }

    // Check Igbo description (when present)
    if (descIgboText) {
      const igboFlag = scanField(descIgboText, phrase, regex, "descriptionIgbo");
      if (igboFlag) {
        flags.push(igboFlag);
      }
    }
  }

  return flags;
}
