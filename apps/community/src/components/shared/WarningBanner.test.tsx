// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WarningBanner } from "./WarningBanner";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    if (params?.reason) return `Reason: ${params.reason}`;
    return key;
  },
}));

const DISMISSED_KEY = "obigbo-dismissed-warnings";

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
  };
})();

beforeAll(() => {
  vi.stubGlobal("localStorage", localStorageMock);
});

beforeEach(() => {
  localStorageMock.clear();
});

const WARNING_1 = { id: "warn-1", reason: "Spam content", createdAt: "2026-03-01T00:00:00.000Z" };
const WARNING_2 = { id: "warn-2", reason: "Offensive post", createdAt: "2026-03-10T00:00:00.000Z" };

describe("WarningBanner", () => {
  it("renders a banner for each warning", () => {
    render(<WarningBanner warnings={[WARNING_1, WARNING_2]} />);
    expect(screen.getByTestId("warning-banner-warn-1")).toBeInTheDocument();
    expect(screen.getByTestId("warning-banner-warn-2")).toBeInTheDocument();
  });

  it("displays the warning reason in the banner", () => {
    render(<WarningBanner warnings={[WARNING_1]} />);
    expect(screen.getByText(/Spam content/)).toBeInTheDocument();
  });

  it("dismisses a warning when 'I understand' is clicked", () => {
    render(<WarningBanner warnings={[WARNING_1]} />);
    const dismissBtn = screen.getByRole("button", { name: "dismiss" });
    fireEvent.click(dismissBtn);
    expect(screen.queryByTestId("warning-banner-warn-1")).not.toBeInTheDocument();
  });

  it("persists dismissal in localStorage so dismissed banner stays hidden on remount", () => {
    const { unmount } = render(<WarningBanner warnings={[WARNING_1]} />);
    fireEvent.click(screen.getByRole("button", { name: "dismiss" }));
    unmount();

    render(<WarningBanner warnings={[WARNING_1]} />);
    expect(screen.queryByTestId("warning-banner-warn-1")).not.toBeInTheDocument();

    const dismissed = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]") as string[];
    expect(dismissed).toContain("warn-1");
  });

  it("renders nothing when warnings list is empty", () => {
    const { container } = render(<WarningBanner warnings={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
