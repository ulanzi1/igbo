// @vitest-environment node
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { formatPostingAge } from "./format-posting-age";

const NOW = new Date("2026-04-16T12:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("formatPostingAge", () => {
  it("returns relative with days=0 for a post made today", () => {
    const today = new Date(NOW.getTime() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
    const result = formatPostingAge(today, "en");
    expect(result.variant).toBe("relative");
    if (result.variant === "relative") {
      expect(result.days).toBe(0);
    }
  });

  it("returns relative with days=1 for a post made 1 day ago", () => {
    const yesterday = new Date(NOW.getTime() - 25 * 60 * 60 * 1000).toISOString();
    const result = formatPostingAge(yesterday, "en");
    expect(result.variant).toBe("relative");
    if (result.variant === "relative") {
      expect(result.days).toBe(1);
    }
  });

  it("returns relative for a 6-day-old post", () => {
    const sixDays = new Date(NOW.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString();
    const result = formatPostingAge(sixDays, "en");
    expect(result.variant).toBe("relative");
    if (result.variant === "relative") {
      expect(result.days).toBe(6);
    }
  });

  it("returns absolute for a 7-day-old post", () => {
    const sevenDays = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const result = formatPostingAge(sevenDays, "en");
    expect(result.variant).toBe("absolute");
    if (result.variant === "absolute") {
      expect(result.date).toBeTruthy();
      expect(result.date).toContain("2026");
    }
  });

  it("returns absolute for an older post", () => {
    const old = "2026-01-01T00:00:00.000Z";
    const result = formatPostingAge(old, "en");
    expect(result.variant).toBe("absolute");
  });

  it("handles 'ig' locale without throwing", () => {
    const old = "2026-01-01T00:00:00.000Z";
    const result = formatPostingAge(old, "ig");
    expect(result.variant).toBe("absolute");
    if (result.variant === "absolute") {
      expect(result.date).toBeTruthy();
    }
  });

  it("clamps negative age to 0 (future-dated createdAt from clock skew — M4 review fix)", () => {
    // Simulate a server row whose createdAt is 3 hours in the future
    const future = new Date(NOW.getTime() + 3 * 60 * 60 * 1000).toISOString();
    const result = formatPostingAge(future, "en");
    expect(result.variant).toBe("relative");
    if (result.variant === "relative") {
      expect(result.days).toBe(0);
      expect(result.days).toBeGreaterThanOrEqual(0);
    }
  });

  it("clamps extreme future dates within the 7-day window to 0", () => {
    // 2 days in the future — still falls inside the relative branch (daysAge < 7)
    const future = new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const result = formatPostingAge(future, "en");
    expect(result.variant).toBe("relative");
    if (result.variant === "relative") {
      expect(result.days).toBe(0);
    }
  });
});
