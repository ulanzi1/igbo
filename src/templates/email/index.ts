import "server-only";
import { render as renderEmailVerification } from "./email-verification";
import { render as renderApplicationReceived } from "./application-received";
import { render as renderWelcomeApproved } from "./welcome-approved";
import { render as renderRequestInfo } from "./request-info";
import { render as renderRejectionNotice } from "./rejection-notice";
import { render as renderMemberWelcome } from "./member-welcome";
import { render as renderAccountLockout } from "./account-lockout";
import { render as renderEmailOtp } from "./email-otp";
import { render as renderPasswordReset } from "./password-reset";
import { render as renderPasswordResetConfirmation } from "./password-reset-confirmation";
import { render as renderSessionEvicted } from "./session-evicted";
import { render as render2faResetComplete } from "./2fa-reset-complete";
import { render as renderGdprAccountDeletion } from "./gdpr-account-deletion";
import { render as renderGdprExportReady } from "./gdpr-export-ready";
import { render as renderGdprBreachNotification } from "./gdpr-breach-notification";
import type { EmailTemplateResult, EmailTemplateRenderer } from "./types";

export type { EmailTemplateResult, EmailTemplateRenderer };

const REGISTRY: Record<string, EmailTemplateRenderer> = {
  "email-verification": renderEmailVerification,
  "application-received": renderApplicationReceived,
  "welcome-approved": renderWelcomeApproved,
  "request-info": renderRequestInfo,
  "rejection-notice": renderRejectionNotice,
  "member-welcome": renderMemberWelcome,
  "account-lockout": renderAccountLockout,
  "email-otp": renderEmailOtp,
  "password-reset": renderPasswordReset,
  "password-reset-confirmation": renderPasswordResetConfirmation,
  "session-evicted": renderSessionEvicted,
  "2fa-reset-complete": render2faResetComplete,
  "gdpr-account-deletion": renderGdprAccountDeletion,
  "gdpr-export-ready": renderGdprExportReady,
  "gdpr-breach-notification": renderGdprBreachNotification,
};

export function renderTemplate(
  templateId: string,
  data: Record<string, unknown>,
  locale: "en" | "ig" = "en",
): EmailTemplateResult {
  const renderer = REGISTRY[templateId];
  if (!renderer) throw new Error(`Unknown email template: ${templateId}`);
  return renderer(data, locale);
}
