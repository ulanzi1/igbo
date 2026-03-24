// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockUseSocketContext = vi.fn();
vi.mock("@/providers/SocketProvider", () => ({
  useSocketContext: () => mockUseSocketContext(),
}));

import { useServiceHealth } from "./service-health";

function renderHealth(
  phase: "connected" | "reconnecting" | "lost" = "connected",
  dailyEnabled?: string,
) {
  mockUseSocketContext.mockReturnValue({
    notificationsSocket: null,
    chatSocket: null,
    isConnected: phase !== "lost",
    connectionPhase: phase,
  });

  if (dailyEnabled !== undefined) {
    vi.stubEnv("NEXT_PUBLIC_DAILY_ENABLED", dailyEnabled);
  } else {
    vi.unstubAllEnvs();
  }

  return renderHook(() => useServiceHealth());
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("useServiceHealth", () => {
  it("returns chatAvailable=true when connectionPhase is 'connected'", () => {
    const { result } = renderHealth("connected");
    expect(result.current.chatAvailable).toBe(true);
  });

  it("returns chatAvailable=true when connectionPhase is 'reconnecting'", () => {
    const { result } = renderHealth("reconnecting");
    expect(result.current.chatAvailable).toBe(true);
  });

  it("returns chatAvailable=false when connectionPhase is 'lost'", () => {
    const { result } = renderHealth("lost");
    expect(result.current.chatAvailable).toBe(false);
  });

  it("returns videoAvailable=true when NEXT_PUBLIC_DAILY_ENABLED is 'true'", () => {
    const { result } = renderHealth("connected", "true");
    expect(result.current.videoAvailable).toBe(true);
  });

  it("returns videoAvailable=false when NEXT_PUBLIC_DAILY_ENABLED is 'false'", () => {
    const { result } = renderHealth("connected", "false");
    expect(result.current.videoAvailable).toBe(false);
  });

  it("returns videoAvailable=false when NEXT_PUBLIC_DAILY_ENABLED is undefined (explicit opt-in)", () => {
    const { result } = renderHealth("connected");
    // Requires explicit NEXT_PUBLIC_DAILY_ENABLED=true — missing means unavailable
    expect(result.current.videoAvailable).toBe(false);
  });

  it("reports degradedServices=[] when all healthy (Daily explicitly enabled)", () => {
    const { result } = renderHealth("connected", "true");
    expect(result.current.degradedServices).toEqual([]);
  });

  it("reports degradedServices=['chat'] when chat is lost", () => {
    const { result } = renderHealth("lost", "true");
    expect(result.current.degradedServices).toContain("chat");
    expect(result.current.degradedServices).not.toContain("video");
  });

  it("reports degradedServices=['video'] when Daily disabled", () => {
    const { result } = renderHealth("connected", "false");
    expect(result.current.degradedServices).toContain("video");
    expect(result.current.degradedServices).not.toContain("chat");
  });

  it("reports degradedServices=['chat','video'] when both degraded", () => {
    const { result } = renderHealth("lost", "false");
    expect(result.current.degradedServices).toContain("chat");
    expect(result.current.degradedServices).toContain("video");
  });
});
