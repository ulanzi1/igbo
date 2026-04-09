import "server-only";
import { render as renderApplicationConfirmation } from "./application-confirmation";
import type { EmailTemplateResult, EmailTemplateRenderer } from "./types";

export type { EmailTemplateResult, EmailTemplateRenderer };

const REGISTRY: Record<string, EmailTemplateRenderer> = {
  "application-confirmation": renderApplicationConfirmation,
};

export function renderTemplate(
  templateId: string,
  data: Record<string, unknown>,
  locale: "en" | "ig" = "en",
): EmailTemplateResult {
  const renderer = REGISTRY[templateId];
  if (!renderer) throw new Error(`Unknown portal email template: ${templateId}`);
  return renderer(data, locale);
}
