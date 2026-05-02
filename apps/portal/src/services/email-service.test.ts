// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Stable mockSend accessible across all tests
const mockSend = vi.hoisted(() => vi.fn());

// Mock resend with a class — classes CAN be constructors (unlike arrow fns in vi.fn())
vi.mock("resend", () => ({
  Resend: class MockResend {
    emails = { send: mockSend };
  },
}));

// Mock template registry
vi.mock("@/templates/email", () => ({
  renderTemplate: vi.fn().mockReturnValue({
    subject: "Test Subject",
    html: "<p>Test</p>",
    text: "Test",
  }),
}));

// Redis mock for NX dedup
const mockRedisSet = vi.hoisted(() => vi.fn());
vi.mock("@/lib/redis", () => ({
  getRedisClient: vi.fn(() => ({
    set: mockRedisSet,
  })),
}));

import { emailService, enqueueEmailJob } from "./email-service";
import type { EmailPayload } from "./email-service";
import { renderTemplate } from "@/templates/email";

const MOCK_PAYLOAD: EmailPayload = {
  to: "test@example.com",
  templateId: "application-confirmation",
  data: { seekerName: "Ada" },
  locale: "en",
};

describe("emailService.send", () => {
  beforeEach(() => {
    vi.mocked(renderTemplate).mockReturnValue({
      subject: "Test Subject",
      html: "<p>Test</p>",
      text: "Test",
    });
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM_ADDRESS = "noreply@test.com";
    process.env.EMAIL_FROM_NAME = "Test Portal";
    delete process.env.ENABLE_EMAIL_SENDING;
    mockSend.mockReset();
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM_ADDRESS;
    delete process.env.EMAIL_FROM_NAME;
    delete process.env.ENABLE_EMAIL_SENDING;
  });

  it("skips sending when ENABLE_EMAIL_SENDING=false", async () => {
    process.env.ENABLE_EMAIL_SENDING = "false";
    await emailService.send(MOCK_PAYLOAD);
    expect(renderTemplate).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("renders template and calls Resend when enabled", async () => {
    mockSend.mockResolvedValue({ data: { id: "resend_abc" }, error: null });

    await emailService.send(MOCK_PAYLOAD);

    expect(renderTemplate).toHaveBeenCalledWith(
      "application-confirmation",
      MOCK_PAYLOAD.data,
      "en",
    );
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "test@example.com",
        subject: "Test Subject",
        html: "<p>Test</p>",
        text: "Test",
      }),
    );
  });

  it("throws when Resend returns an error", async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: "Invalid API key" } });

    await expect(emailService.send(MOCK_PAYLOAD)).rejects.toThrow("Resend API error");
  });

  it("uses EMAIL_FROM_NAME and EMAIL_FROM_ADDRESS for from field", async () => {
    mockSend.mockResolvedValue({ data: { id: "resend_abc" }, error: null });

    await emailService.send(MOCK_PAYLOAD);

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Test Portal <noreply@test.com>",
      }),
    );
  });

  it("uses default from address when env vars not set", async () => {
    delete process.env.EMAIL_FROM_ADDRESS;
    delete process.env.EMAIL_FROM_NAME;
    mockSend.mockResolvedValue({ data: { id: "resend_abc" }, error: null });

    await emailService.send(MOCK_PAYLOAD);

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: expect.stringContaining("OBIGBO"),
      }),
    );
  });

  it("uses ig locale for template rendering when specified", async () => {
    mockSend.mockResolvedValue({ data: { id: "resend_abc" }, error: null });

    await emailService.send({ ...MOCK_PAYLOAD, locale: "ig" });

    expect(renderTemplate).toHaveBeenCalledWith(expect.any(String), expect.any(Object), "ig");
  });

  it("throws when RESEND_API_KEY is missing", async () => {
    delete process.env.RESEND_API_KEY;
    await expect(emailService.send(MOCK_PAYLOAD)).rejects.toThrow("RESEND_API_KEY");
  });
});

describe("enqueueEmailJob", () => {
  beforeEach(() => {
    vi.mocked(renderTemplate).mockReturnValue({
      subject: "Test Subject",
      html: "<p>Test</p>",
      text: "Test",
    });
    process.env.RESEND_API_KEY = "re_test_key";
    delete process.env.ENABLE_EMAIL_SENDING;
    mockSend.mockReset();
    // Default: first call → NX acquired ("OK" = key set, not deduped)
    mockRedisSet.mockReset();
    mockRedisSet.mockResolvedValue("OK");
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.ENABLE_EMAIL_SENDING;
  });

  it("is fire-and-forget — does not throw on send failure", async () => {
    mockSend.mockRejectedValue(new Error("Network error"));

    // async function never throws synchronously
    await expect(enqueueEmailJob("test-job", MOCK_PAYLOAD)).resolves.not.toThrow();

    // Wait for async to settle
    await new Promise((r) => setTimeout(r, 10));
  });

  it("skips send when ENABLE_EMAIL_SENDING=false", async () => {
    process.env.ENABLE_EMAIL_SENDING = "false";
    await enqueueEmailJob("test-job", MOCK_PAYLOAD);
    await new Promise((r) => setTimeout(r, 10));
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("sends email asynchronously when enabled", async () => {
    mockSend.mockResolvedValue({ data: { id: "resend_abc" }, error: null });

    await enqueueEmailJob("test-job", MOCK_PAYLOAD);

    await new Promise((r) => setTimeout(r, 10));
    expect(mockSend).toHaveBeenCalled();
  });

  // ── Redis NX dedup tests ────────────────────────────────────────────────────

  it("first call with a name returns true (sent)", async () => {
    mockRedisSet.mockResolvedValue("OK"); // NX acquired
    mockSend.mockResolvedValue({ data: { id: "r1" }, error: null });

    const result = await enqueueEmailJob("app-confirmed-app-001", MOCK_PAYLOAD);

    expect(result).toBe(true);
  });

  it("second call with the same name returns false (deduped)", async () => {
    mockRedisSet.mockResolvedValue(null); // null = key already exists → deduped

    const result = await enqueueEmailJob("app-confirmed-app-001", MOCK_PAYLOAD);

    expect(result).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("call with a different name returns true (dedup is key-scoped, not global)", async () => {
    mockRedisSet.mockResolvedValueOnce(null).mockResolvedValueOnce("OK");

    await enqueueEmailJob("app-confirmed-app-001", MOCK_PAYLOAD); // deduped
    mockSend.mockResolvedValue({ data: { id: "r2" }, error: null });
    const result = await enqueueEmailJob("app-confirmed-app-002", MOCK_PAYLOAD); // different key

    expect(result).toBe(true);
  });

  it("Redis throws → returns true (fail-open: proceed with send)", async () => {
    mockRedisSet.mockRejectedValue(new Error("Redis unavailable"));
    mockSend.mockResolvedValue({ data: { id: "r3" }, error: null });

    const result = await enqueueEmailJob("app-confirmed-app-001", MOCK_PAYLOAD);

    expect(result).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    expect(mockSend).toHaveBeenCalled();
  });

  it("Redis SET NX is called with TTL of 900 seconds (15 min)", async () => {
    mockSend.mockResolvedValue({ data: { id: "r4" }, error: null });

    await enqueueEmailJob("app-confirmed-app-001", MOCK_PAYLOAD);

    expect(mockRedisSet).toHaveBeenCalledWith(
      expect.stringContaining("portal:dedup:email:app-confirmed-app-001"),
      "1",
      "EX",
      900,
      "NX",
    );
  });
});
