// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
}));

global.fetch = vi.fn();

import { useSession } from "next-auth/react";
import { useViewTracking } from "./use-view-tracking";

const APP_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const EMPLOYER_SESSION = {
  data: { user: { id: "employer-1", activePortalRole: "EMPLOYER" } },
  status: "authenticated" as const,
};
const SEEKER_SESSION = {
  data: { user: { id: "seeker-1", activePortalRole: "JOB_SEEKER" } },
  status: "authenticated" as const,
};
const LOADING_SESSION = {
  data: null,
  status: "loading" as const,
};

describe("useViewTracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires POST after 2s dwell time for employer role", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(useSession).mockReturnValue(EMPLOYER_SESSION as any);
    renderHook(() => useViewTracking(APP_ID));
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2001);
    });
    expect(fetch).toHaveBeenCalledWith(`/api/v1/applications/${APP_ID}/viewed`, { method: "POST" });
  });

  it("does NOT fire before 2s threshold", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(useSession).mockReturnValue(EMPLOYER_SESSION as any);
    renderHook(() => useViewTracking(APP_ID));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1999);
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("clears timer on unmount before 2s — no POST sent", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(useSession).mockReturnValue(EMPLOYER_SESSION as any);
    const { unmount } = renderHook(() => useViewTracking(APP_ID));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    act(() => {
      unmount();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does NOT fire for JOB_SEEKER role", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(useSession).mockReturnValue(SEEKER_SESSION as any);
    renderHook(() => useViewTracking(APP_ID));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does NOT fire when session status is 'loading'", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(useSession).mockReturnValue(LOADING_SESSION as any);
    renderHook(() => useViewTracking(APP_ID));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("debounces rapid open/close/open — does not fire twice within 5s", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(useSession).mockReturnValue(EMPLOYER_SESSION as any);
    const { rerender } = renderHook(({ id }) => useViewTracking(id), {
      initialProps: { id: APP_ID as string | null },
    });
    // First open — fires after 2s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2001);
    });
    expect(fetch).toHaveBeenCalledTimes(1);

    // Close and reopen within 5s — should be debounced
    rerender({ id: null });
    rerender({ id: APP_ID });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2001);
    });
    // Still only called once — debounce prevented second call
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("handles 204 duplicate response gracefully (no error thrown)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(useSession).mockReturnValue(EMPLOYER_SESSION as any);
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    renderHook(() => useViewTracking(APP_ID));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2001);
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
