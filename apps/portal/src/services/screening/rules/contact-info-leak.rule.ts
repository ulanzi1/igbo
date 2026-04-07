import "server-only";
import type { ScreeningFlag, ScreeningInput } from "../types";
import { stripHtmlToText } from "../text-utils";

const PHONE_REGEX = /\+?\d[\d\s\-().]{7,}\d/g;
const EMAIL_REGEX = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const URL_REGEX = /https?:\/\/\S+/g;

export function contactInfoLeakRule(input: ScreeningInput): ScreeningFlag[] {
  const plain = stripHtmlToText(input.descriptionHtml);
  if (!plain) return [];

  const flags: ScreeningFlag[] = [];

  const phoneMatch = plain.match(PHONE_REGEX);
  if (phoneMatch) {
    flags.push({
      rule_id: "contact_info_leak",
      message: "Phone number detected in job description.",
      severity: "medium",
      field: "description",
      match: phoneMatch[0],
    });
  }

  const emailMatch = plain.match(EMAIL_REGEX);
  if (emailMatch) {
    flags.push({
      rule_id: "contact_info_leak",
      message: "Email address detected in job description.",
      severity: "medium",
      field: "description",
      match: emailMatch[0],
    });
  }

  const urlMatch = plain.match(URL_REGEX);
  if (urlMatch) {
    flags.push({
      rule_id: "contact_info_leak",
      message: "External URL detected in job description.",
      severity: "medium",
      field: "description",
      match: urlMatch[0],
    });
  }

  return flags;
}
