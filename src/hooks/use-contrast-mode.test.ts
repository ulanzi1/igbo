// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { useContrastMode, STORAGE_KEY } from "./use-contrast-mode";

// localStorage mock for reliable cross-jsdom-version behavior
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
})();

describe("useContrastMode", () => {
  beforeAll(() => {
    vi.stubGlobal("localStorage", localStorageMock);
  });

  beforeEach(() => {
    localStorageMock.clear();
    document.documentElement.removeAttribute("data-contrast");
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("returns default mode when no stored preference exists", () => {
    const { result } = renderHook(() => useContrastMode());
    expect(result.current.mode).toBe("default");
    expect(result.current.isHighContrast).toBe(false);
  });

  it("reads stored preference from localStorage on mount", () => {
    localStorageMock.setItem(STORAGE_KEY, "high");
    const { result } = renderHook(() => useContrastMode());
    expect(result.current.mode).toBe("high");
    expect(result.current.isHighContrast).toBe(true);
  });

  it("toggles from default to high contrast", () => {
    const { result } = renderHook(() => useContrastMode());
    act(() => {
      result.current.toggle();
    });
    expect(result.current.mode).toBe("high");
    expect(result.current.isHighContrast).toBe(true);
  });

  it("toggles back from high to default", () => {
    localStorageMock.setItem(STORAGE_KEY, "high");
    const { result } = renderHook(() => useContrastMode());
    act(() => {
      result.current.toggle();
    });
    expect(result.current.mode).toBe("default");
    expect(result.current.isHighContrast).toBe(false);
  });

  it("persists mode to localStorage on toggle", () => {
    const { result } = renderHook(() => useContrastMode());
    act(() => {
      result.current.toggle();
    });
    expect(localStorageMock.getItem(STORAGE_KEY)).toBe("high");
  });

  it("applies data-contrast attribute on <html> when mode is high", () => {
    const { result } = renderHook(() => useContrastMode());
    act(() => {
      result.current.toggle();
    });
    expect(document.documentElement.getAttribute("data-contrast")).toBe("high");
  });

  it("removes data-contrast attribute from <html> when mode is default", () => {
    localStorageMock.setItem(STORAGE_KEY, "high");
    const { result } = renderHook(() => useContrastMode());
    act(() => {
      result.current.toggle();
    });
    expect(document.documentElement.getAttribute("data-contrast")).toBeNull();
  });

  it("sets a specific mode via setContrastMode", () => {
    const { result } = renderHook(() => useContrastMode());
    act(() => {
      result.current.setContrastMode("high");
    });
    expect(result.current.mode).toBe("high");
    act(() => {
      result.current.setContrastMode("default");
    });
    expect(result.current.mode).toBe("default");
  });
});
