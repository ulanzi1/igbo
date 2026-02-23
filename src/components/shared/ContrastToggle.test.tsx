// @vitest-environment jsdom
import { render, screen, fireEvent } from "@/test/test-utils";
import { ContrastToggle } from "./ContrastToggle";
import { STORAGE_KEY } from "@/hooks/use-contrast-mode";

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) => `${namespace}.${key}`,
  useLocale: () => "en",
}));

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

describe("ContrastToggle", () => {
  beforeAll(() => {
    vi.stubGlobal("localStorage", localStorageMock);
  });

  beforeEach(() => {
    localStorageMock.clear();
    document.documentElement.removeAttribute("data-contrast");
    vi.clearAllMocks();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("renders a toggle button with accessible aria-label", () => {
    render(<ContrastToggle />);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-label", "Shell.contrastToggle");
  });

  it("renders with aria-pressed=false in default mode", () => {
    render(<ContrastToggle />);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("toggles to high contrast on click and updates aria-pressed", () => {
    render(<ContrastToggle />);
    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveAttribute("aria-label", "Shell.contrastToggle");
  });

  it("applies data-contrast='high' on <html> when toggled on", () => {
    render(<ContrastToggle />);
    fireEvent.click(screen.getByRole("button"));
    expect(document.documentElement.getAttribute("data-contrast")).toBe("high");
  });

  it("removes data-contrast from <html> when toggled off", () => {
    localStorageMock.setItem(STORAGE_KEY, "high");
    render(<ContrastToggle />);
    fireEvent.click(screen.getByRole("button"));
    expect(document.documentElement.getAttribute("data-contrast")).toBeNull();
  });

  it("persists the preference to localStorage on toggle", () => {
    render(<ContrastToggle />);
    fireEvent.click(screen.getByRole("button"));
    expect(localStorageMock.getItem(STORAGE_KEY)).toBe("high");
  });

  it("reads stored high-contrast preference from localStorage on mount", () => {
    localStorageMock.setItem(STORAGE_KEY, "high");
    render(<ContrastToggle />);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveAttribute("aria-label", "Shell.contrastToggle");
  });
});
