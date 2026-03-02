// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useNotificationSound } from "./use-notification-sound";

beforeEach(() => {
  vi.clearAllMocks();

  global.AudioContext = vi.fn().mockImplementation(() => ({
    currentTime: 0,
    state: "running",
    resume: vi.fn().mockResolvedValue(undefined),
    destination: {},
    createOscillator: vi.fn(() => ({
      frequency: { value: 0 },
      type: "sine" as OscillatorType,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    })),
    createGain: vi.fn(() => ({
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    })),
  })) as unknown as typeof AudioContext;
});

describe("useNotificationSound", () => {
  it("returns a playChime function", () => {
    const { result } = renderHook(() => useNotificationSound());
    expect(typeof result.current.playChime).toBe("function");
  });

  it("creates AudioContext when playChime is called", () => {
    const { result } = renderHook(() => useNotificationSound());

    act(() => {
      result.current.playChime();
    });

    // AudioContext was constructed at least once
    expect(global.AudioContext).toHaveBeenCalled();
  });

  it("does not create AudioContext until playChime is called", () => {
    renderHook(() => useNotificationSound());

    // Hook only initializes AudioContext lazily
    expect(global.AudioContext).not.toHaveBeenCalled();
  });

  it("silently ignores errors when AudioContext is unavailable", () => {
    global.AudioContext = vi.fn().mockImplementation(() => {
      throw new Error("Not supported");
    }) as unknown as typeof AudioContext;

    const { result } = renderHook(() => useNotificationSound());

    expect(() => {
      act(() => {
        result.current.playChime();
      });
    }).not.toThrow();
  });

  it("playChime is stable across renders (memoized)", () => {
    const { result, rerender } = renderHook(() => useNotificationSound());
    const firstRef = result.current.playChime;

    rerender();

    expect(result.current.playChime).toBe(firstRef);
  });
});
