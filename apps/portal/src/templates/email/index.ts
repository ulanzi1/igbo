import "server-only";
import { render as renderApplicationConfirmation } from "./application-confirmation";
import { render as renderSavedSearchDigest } from "./saved-search-digest";
import { render as renderNotificationDigest } from "./notification-digest";
import { render as renderApplicationSubmittedEmployer } from "./application-submitted-employer";
import { render as renderApplicationStatusChanged } from "./application-status-changed";
import { render as renderJobApproved } from "./job-approved";
import { render as renderJobRejected } from "./job-rejected";
import { render as renderJobChangesRequested } from "./job-changes-requested";
import { render as renderJobExpired } from "./job-expired";
import { render as renderApplicationViewed } from "./application-viewed";
import type { EmailTemplateResult, EmailTemplateRenderer } from "./types";

export type { EmailTemplateResult, EmailTemplateRenderer };

const REGISTRY: Record<string, EmailTemplateRenderer> = {
  "application-confirmation": renderApplicationConfirmation,
  "saved-search-digest": renderSavedSearchDigest,
  "notification-digest": renderNotificationDigest,
  "application-submitted-employer": renderApplicationSubmittedEmployer,
  "application-status-changed": renderApplicationStatusChanged,
  "job-approved": renderJobApproved,
  "job-rejected": renderJobRejected,
  "job-changes-requested": renderJobChangesRequested,
  "job-expired": renderJobExpired,
  "application-viewed": renderApplicationViewed,
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
