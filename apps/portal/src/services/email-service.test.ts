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
    vi.useFakeTimers();
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM_ADDRESS;
    delete process.env.EMAIL_FROM_NAME;
    delete process.env.ENABLE_EMAIL_SENDING;
    vi.useRealTimers();
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

  it("throws when Resend returns an error (after all retries)", async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: "Invalid API key" } });

    const p = emailService.send(MOCK_PAYLOAD);
    // Attach handler before advancing to prevent unhandled rejection warning
    const assertion = expect(p).rejects.toThrow("Resend API error");
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(30000);
    await assertion;
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

describe("emailService.send — retry logic", () => {
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
    vi.useFakeTimers();
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM_ADDRESS;
    delete process.env.EMAIL_FROM_NAME;
    delete process.env.ENABLE_EMAIL_SENDING;
    vi.useRealTimers();
  });

  it("succeeds on first attempt — no retry delay, send called once", async () => {
    mockSend.mockResolvedValue({ data: { id: "r1" }, error: null });

    await emailService.send(MOCK_PAYLOAD);

    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("succeeds on 2nd attempt after 1 failure — 1s delay", async () => {
    mockSend
      .mockResolvedValueOnce({ data: null, error: { message: "Temporary failure" } })
      .mockResolvedValueOnce({ data: { id: "r2" }, error: null });

    const p = emailService.send(MOCK_PAYLOAD);
    await vi.advanceTimersByTimeAsync(1000); // past 1s delay
    await p;

    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it("succeeds on 3rd attempt after 2 failures — 1s + 5s delays", async () => {
    mockSend
      .mockResolvedValueOnce({ data: null, error: { message: "Fail 1" } })
      .mockResolvedValueOnce({ data: null, error: { message: "Fail 2" } })
      .mockResolvedValueOnce({ data: { id: "r3" }, error: null });

    const p = emailService.send(MOCK_PAYLOAD);
    await vi.advanceTimersByTimeAsync(1000); // past 1s
    await vi.advanceTimersByTimeAsync(5000); // past 5s
    await p;

    expect(mockSend).toHaveBeenCalledTimes(3);
  });

  it("throws after all 3 retries exhausted — error propagated", async () => {
    // 4 total calls: attempt 0, 1, 2, 3 (RETRY_DELAYS_MS has 3 entries → loop runs 4 times)
    mockSend
      .mockResolvedValueOnce({ data: null, error: { message: "Fail 1" } })
      .mockResolvedValueOnce({ data: null, error: { message: "Fail 2" } })
      .mockResolvedValueOnce({ data: null, error: { message: "Fail 3" } })
      .mockResolvedValueOnce({ data: null, error: { message: "Fail 4" } });

    const p = emailService.send(MOCK_PAYLOAD);
    // Attach handler before advancing to prevent unhandled rejection warning
    const assertion = expect(p).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(30000);
    await assertion;
    expect(mockSend).toHaveBeenCalledTimes(4); // initial + 3 retries
  });

  it("logs structured warn on each retry attempt", async () => {
    const warnSpy = vi.spyOn(console, "warn");
    mockSend
      .mockResolvedValueOnce({ data: null, error: { message: "Fail 1" } })
      .mockResolvedValueOnce({ data: { id: "r2" }, error: null });

    const p = emailService.send(MOCK_PAYLOAD);
    await vi.advanceTimersByTimeAsync(1000);
    await p;

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const warnArg = warnSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(warnArg) as Record<string, unknown>;
    expect(parsed.level).toBe("warn");
    expect(parsed.message).toBe("portal.email.send.retry");
    expect(parsed.attempt).toBe(1);
    expect(parsed.nextDelayMs).toBe(1000);
  });

  it("logs retries_exhausted error after all 3 fail", async () => {
    const errorSpy = vi.spyOn(console, "error");
    // mockResolvedValue applies to ALL calls (persistent default)
    mockSend.mockResolvedValue({ data: null, error: { message: "Always fails" } });

    const p = emailService.send(MOCK_PAYLOAD);
    // Attach catch before advancing timers to prevent unhandled rejection warning
    const caught = p.catch(() => {});
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(30000);
    await caught;

    const allErrorArgs = errorSpy.mock.calls.map((c) => {
      try {
        return JSON.parse(c[0] as string) as Record<string, unknown>;
      } catch {
        return null;
      }
    });
    const exhausted = allErrorArgs.find(
      (a) => a?.message === "portal.email.send.retries_exhausted",
    );
    expect(exhausted).toBeDefined();
    expect(exhausted?.totalAttempts).toBe(4);
  });

  it("handles non-Error rejection without crashing retry loop", async () => {
    // Simulate emails.send() rejecting with a plain object (not an Error instance)
    // sendWithRetry must handle this without crashing
    mockSend
      .mockRejectedValueOnce({ code: 429, name: "RateLimitError" })
      .mockResolvedValueOnce({ data: { id: "r4" }, error: null });

    const p = emailService.send(MOCK_PAYLOAD);
    await vi.advanceTimersByTimeAsync(1000); // past 1s delay between attempt 0 and 1
    await p;

    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it("retry delays are spaced correctly — 1s then 5s", async () => {
    mockSend
      .mockResolvedValueOnce({ data: null, error: { message: "Fail 1" } })
      .mockResolvedValueOnce({ data: null, error: { message: "Fail 2" } })
      .mockResolvedValueOnce({ data: { id: "r3" }, error: null });

    const p = emailService.send(MOCK_PAYLOAD);

    // After 999ms: 2nd attempt not yet started
    await vi.advanceTimersByTimeAsync(999);
    expect(mockSend).toHaveBeenCalledTimes(1);

    // After 1000ms: 2nd attempt fires
    await vi.advanceTimersByTimeAsync(1);
    expect(mockSend).toHaveBeenCalledTimes(2);

    // After 5s more: 3rd attempt fires
    await vi.advanceTimersByTimeAsync(5000);
    await p;
    expect(mockSend).toHaveBeenCalledTimes(3);
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
