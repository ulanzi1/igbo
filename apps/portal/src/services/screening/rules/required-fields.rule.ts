import "server-only";
import type { ScreeningFlag, ScreeningInput } from "../types";
import { stripHtmlToText } from "../text-utils";

export function requiredFieldsRule(input: ScreeningInput): ScreeningFlag[] {
  const flags: ScreeningFlag[] = [];

  if (!input.title || input.title.trim() === "") {
    flags.push({
      rule_id: "required_field_missing",
      message: "Required field 'title' is missing or empty.",
      severity: "high",
      field: "title",
    });
  }

  const plainDescription = stripHtmlToText(input.descriptionHtml);
  if (plainDescription === "") {
    flags.push({
      rule_id: "required_field_missing",
      message: "Required field 'description' is missing or empty.",
      severity: "high",
      field: "description",
    });
  }

  if (!input.employmentType || input.employmentType.trim() === "") {
    flags.push({
      rule_id: "required_field_missing",
      message: "Required field 'employmentType' is missing or empty.",
      severity: "high",
      field: "employmentType",
    });
  }

  return flags;
}
