// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebouncedValue } from "./use-debounced-value";

describe("useDebouncedValue", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns initial value immediately", () => {
    const { result } = renderHook(() => useDebouncedValue("initial", 300));
    expect(result.current).toBe("initial");
  });

  it("does not update before delay expires", async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: "initial" },
    });

    rerender({ value: "changed" });
    // Advance only 100ms — should not have updated yet
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe("initial");
  });

  it("updates after delay expires", async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: "initial" },
    });

    rerender({ value: "changed" });
    await act(async () => {
      vi.advanceTimersByTimeAsync(300);
    });
    expect(result.current).toBe("changed");
  });

  it("resets the timer on rapid value changes (only last value is applied)", async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: "a" },
    });

    rerender({ value: "b" });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    rerender({ value: "c" });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    rerender({ value: "final" });
    // Not enough time for "final" to fire yet
    expect(result.current).toBe("a");
    // Advance to completion
    await act(async () => {
      vi.advanceTimersByTimeAsync(300);
    });
    expect(result.current).toBe("final");
  });
});
