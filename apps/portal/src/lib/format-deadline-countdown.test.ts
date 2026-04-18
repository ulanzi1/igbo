// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { formatDeadlineCountdown } from "./format-deadline-countdown";

// Pin "now" to a known date for deterministic tests
const NOW = new Date("2026-04-16T12:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("formatDeadlineCountdown", () => {
  it("returns null for null input", () => {
    expect(formatDeadlineCountdown(null, "en")).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(formatDeadlineCountdown(undefined, "en")).toBeNull();
  });

  it("returns null for invalid date string", () => {
    expect(formatDeadlineCountdown("not-a-date", "en")).toBeNull();
  });

  it("returns null for past deadline (expired)", () => {
    expect(formatDeadlineCountdown("2026-04-15T00:00:00.000Z", "en")).toBeNull();
  });

  it("returns critical severity when < 24 hours remaining", () => {
    const almostDue = new Date(NOW.getTime() + 2 * 60 * 60 * 1000).toISOString(); // +2 hours
    const result = formatDeadlineCountdown(almostDue, "en");
    expect(result).not.toBeNull();
    expect(result?.variant).toBe("today");
    expect(result?.severity).toBe("critical");
  });

  it("returns warning severity when < 7 days remaining", () => {
    const threeDays = new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const result = formatDeadlineCountdown(threeDays, "en");
    expect(result).not.toBeNull();
    expect(result?.variant).toBe("inDays");
    expect(result?.severity).toBe("warning");
    expect(result?.days).toBe(3);
  });

  it("returns inDays with normal severity when 7-13 days remaining", () => {
    const tenDays = new Date(NOW.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString();
    const result = formatDeadlineCountdown(tenDays, "en");
    expect(result).not.toBeNull();
    expect(result?.variant).toBe("inDays");
    expect(result?.severity).toBe("normal");
    expect(result?.days).toBe(10);
  });

  it("returns absolute date when 14+ days remaining", () => {
    const future = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const result = formatDeadlineCountdown(future, "en");
    expect(result).not.toBeNull();
    expect(result?.variant).toBe("absolute");
    expect(result?.date).toBeTruthy();
    expect(result?.severity).toBe("normal");
  });

  it("returns absolute date exactly at 14 days boundary", () => {
    const exactly14Days = new Date(NOW.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const result = formatDeadlineCountdown(exactly14Days, "en");
    expect(result?.variant).toBe("absolute");
  });

  it("handles 'ig' locale gracefully (falls back to 'en' for date formatting)", () => {
    const future = new Date(NOW.getTime() + 20 * 24 * 60 * 60 * 1000).toISOString();
    const result = formatDeadlineCountdown(future, "ig");
    expect(result?.variant).toBe("absolute");
    expect(result?.date).toBeTruthy();
  });
});
