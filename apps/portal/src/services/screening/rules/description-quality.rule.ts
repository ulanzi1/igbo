import "server-only";
import type { ScreeningFlag, ScreeningInput } from "../types";
import { stripHtmlToText } from "../text-utils";

const MIN_LENGTH = 100;
const MAX_LENGTH = 50_000;
const ALL_CAPS_RATIO_THRESHOLD = 0.7;
const ALL_CAPS_MIN_CHARS = 50;

function allCapsRatio(text: string): number {
  const letters = text.replace(/[^a-zA-Z]/g, "");
  if (letters.length === 0) return 0;
  const upperCount = (letters.match(/[A-Z]/g) ?? []).length;
  return upperCount / letters.length;
}

export function descriptionQualityRule(input: ScreeningInput): ScreeningFlag[] {
  const plain = stripHtmlToText(input.descriptionHtml);
  const flags: ScreeningFlag[] = [];

  if (plain.length === 0) return flags; // required_fields rule handles empty case

  if (plain.length < MIN_LENGTH) {
    flags.push({
      rule_id: "description_too_short",
      message: `Description is too short (${plain.length} characters; minimum is ${MIN_LENGTH}).`,
      severity: "medium",
      field: "description",
    });
  } else if (plain.length > MAX_LENGTH) {
    flags.push({
      rule_id: "description_too_long",
      message: `Description is too long (${plain.length} characters; maximum is ${MAX_LENGTH}).`,
      severity: "high",
      field: "description",
    });
  }

  // All-caps check: only applied when plain text is long enough to be meaningful
  if (plain.length >= ALL_CAPS_MIN_CHARS) {
    const ratio = allCapsRatio(plain);
    if (ratio > ALL_CAPS_RATIO_THRESHOLD) {
      flags.push({
        rule_id: "description_all_caps",
        message: `Description appears to be written in all caps (${Math.round(ratio * 100)}% uppercase letters).`,
        severity: "medium",
        field: "description",
      });
    }
  }

  return flags;
}
