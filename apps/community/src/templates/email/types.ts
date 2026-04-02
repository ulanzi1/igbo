export interface EmailTemplateResult {
  subject: string;
  html: string;
  text: string;
}

export type EmailTemplateRenderer = (
  data: Record<string, unknown>,
  locale: "en" | "ig",
) => EmailTemplateResult;
