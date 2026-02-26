// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/env", () => ({
  env: {
    EMAIL_PROVIDER: "resend",
    RESEND_API_KEY: "re_test_key",
    EMAIL_FROM_ADDRESS: "noreply@igbo.global",
    EMAIL_FROM_NAME: "OBIGBO",
    EMAIL_SUPPORT_ADDRESS: "support@igbo.global",
    ENABLE_EMAIL_SENDING: "true",
  },
}));

vi.mock("@/templates/email", () => ({
  renderTemplate: vi.fn().mockReturnValue({
    subject: "Test Subject",
    html: "<p>Test HTML</p>",
    text: "Test text",
  }),
}));

const mockSend = vi.fn().mockResolvedValue({
  data: { id: "resend-abc123" },
  error: null,
});

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send: mockSend } };
  }),
}));

vi.mock("@/server/jobs/job-runner", () => ({
  registerJob: vi.fn(),
  runJob: vi.fn().mockResolvedValue(undefined),
}));

import { emailService } from "./email-service";
import { renderTemplate } from "@/templates/email";
import { env } from "@/env";

const basePayload = {
  to: "chima@example.com",
  subject: "Test",
  templateId: "email-verification",
  data: { name: "Chima", verifyUrl: "https://t.co" },
};

describe("emailService.send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockResolvedValue({ data: { id: "resend-abc123" }, error: null });
    (env as Record<string, unknown>).ENABLE_EMAIL_SENDING = "true";
    (env as Record<string, unknown>).RESEND_API_KEY = "re_test_key";
  });

  it("sends email via Resend and logs email.send.success with resendId", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await emailService.send(basePayload);

    expect(mockSend).toHaveBeenCalledTimes(1);

    const logCall = spy.mock.calls.find((args) => {
      const parsed = JSON.parse(args[0] as string) as Record<string, unknown>;
      return parsed.message === "email.send.success";
    });
    expect(logCall).toBeDefined();
    const log = JSON.parse(logCall![0] as string) as Record<string, unknown>;
    expect(log.resendId).toBe("resend-abc123");
    expect(log.templateId).toBe("email-verification");
    spy.mockRestore();
  });

  it("logs toHash (not raw email) on success", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await emailService.send(basePayload);

    const logCall = spy.mock.calls.find((args) => {
      const parsed = JSON.parse(args[0] as string) as Record<string, unknown>;
      return parsed.message === "email.send.success";
    });
    expect(logCall).toBeDefined();
    const log = JSON.parse(logCall![0] as string) as Record<string, unknown>;
    expect(log).not.toHaveProperty("to");
    expect(typeof log.toHash).toBe("string");
    expect((log.toHash as string).length).toBe(64); // SHA-256 hex = 64 chars
    spy.mockRestore();
  });

  it("throws when Resend returns an error object", async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: "Resend API error" } });

    await expect(emailService.send(basePayload)).rejects.toThrow("Resend API error");
  });

  it("does not call Resend and logs email.send.skipped when ENABLE_EMAIL_SENDING=false", async () => {
    (env as Record<string, unknown>).ENABLE_EMAIL_SENDING = "false";
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await emailService.send(basePayload);

    expect(mockSend).not.toHaveBeenCalled();
    const logCall = spy.mock.calls.find((args) => {
      const parsed = JSON.parse(args[0] as string) as Record<string, unknown>;
      return parsed.message === "email.send.skipped";
    });
    expect(logCall).toBeDefined();
    spy.mockRestore();
  });

  it("defaults locale to 'en' when not provided in payload", async () => {
    await emailService.send(basePayload);

    expect(renderTemplate).toHaveBeenCalledWith("email-verification", expect.any(Object), "en");
  });

  it("passes locale 'ig' to renderTemplate when specified", async () => {
    await emailService.send({ ...basePayload, locale: "ig" });

    expect(renderTemplate).toHaveBeenCalledWith("email-verification", expect.any(Object), "ig");
  });

  it("uses payload.from when provided, overriding the default from address", async () => {
    await emailService.send({ ...basePayload, from: "OBIGBO Support <support@igbo.global>" });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ from: "OBIGBO Support <support@igbo.global>" }),
    );
  });

  it("uses default from address when payload.from is not provided", async () => {
    await emailService.send(basePayload);

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ from: "OBIGBO <noreply@igbo.global>" }),
    );
  });

  it("throws before calling Resend when RESEND_API_KEY is absent and ENABLE_EMAIL_SENDING=true", async () => {
    (env as Record<string, unknown>).RESEND_API_KEY = undefined;

    await expect(emailService.send(basePayload)).rejects.toThrow(
      "RESEND_API_KEY is not set but ENABLE_EMAIL_SENDING=true",
    );
    expect(mockSend).not.toHaveBeenCalled();
  });
});
