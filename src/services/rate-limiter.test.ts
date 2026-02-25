// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn(),
  buildRateLimitHeaders: vi.fn(),
}));

import { checkRateLimit, buildRateLimitHeaders } from "@/lib/rate-limiter";
import {
  applyRateLimit,
  buildRateLimitHeaders as reExportedHeaders,
  RATE_LIMIT_PRESETS,
} from "./rate-limiter";

const mockCheckRateLimit = vi.mocked(checkRateLimit);

describe("RATE_LIMIT_PRESETS", () => {
  it("all presets have maxRequests and windowMs", () => {
    for (const [name, preset] of Object.entries(RATE_LIMIT_PRESETS)) {
      expect(typeof preset.maxRequests, `${name}.maxRequests`).toBe("number");
      expect(typeof preset.windowMs, `${name}.windowMs`).toBe("number");
      expect(preset.maxRequests, `${name}.maxRequests > 0`).toBeGreaterThan(0);
      expect(preset.windowMs, `${name}.windowMs > 0`).toBeGreaterThan(0);
    }
  });

  it("LOGIN preset has expected values", () => {
    expect(RATE_LIMIT_PRESETS.LOGIN.maxRequests).toBe(10);
    expect(RATE_LIMIT_PRESETS.LOGIN.windowMs).toBe(60_000);
  });

  it("LANGUAGE_UPDATE preset has expected values", () => {
    expect(RATE_LIMIT_PRESETS.LANGUAGE_UPDATE.maxRequests).toBe(30);
    expect(RATE_LIMIT_PRESETS.LANGUAGE_UPDATE.windowMs).toBe(60_000);
  });

  it("GDPR_EXPORT preset is 1 per 7 days", () => {
    expect(RATE_LIMIT_PRESETS.GDPR_EXPORT.maxRequests).toBe(1);
    expect(RATE_LIMIT_PRESETS.GDPR_EXPORT.windowMs).toBe(604_800_000);
  });
});

describe("applyRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates to checkRateLimit with correct key and preset args", async () => {
    const mockResult = { allowed: true, remaining: 5, resetAt: Date.now() + 60_000, limit: 10 };
    mockCheckRateLimit.mockResolvedValue(mockResult);

    const result = await applyRateLimit("user:123", RATE_LIMIT_PRESETS.LANGUAGE_UPDATE);

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      "user:123",
      RATE_LIMIT_PRESETS.LANGUAGE_UPDATE.maxRequests,
      RATE_LIMIT_PRESETS.LANGUAGE_UPDATE.windowMs,
    );
    expect(result).toEqual(mockResult);
  });

  it("returns the result from checkRateLimit when denied", async () => {
    const mockResult = { allowed: false, remaining: 0, resetAt: Date.now() + 60_000, limit: 10 };
    mockCheckRateLimit.mockResolvedValue(mockResult);

    const result = await applyRateLimit("ip:1.2.3.4", RATE_LIMIT_PRESETS.LOGIN);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});

describe("re-exports", () => {
  it("re-exports buildRateLimitHeaders from @/lib/rate-limiter", () => {
    expect(reExportedHeaders).toBe(buildRateLimitHeaders);
  });
});
