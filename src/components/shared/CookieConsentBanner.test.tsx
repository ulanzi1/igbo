import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CookieConsentBanner } from "./CookieConsentBanner";

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const COOKIE_NAME = "cookie-consent";

function clearCookies() {
  document.cookie = `${COOKIE_NAME}=; max-age=0; path=/`;
}

function setConsentCookie(prefs: object) {
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(prefs))}; path=/`;
}

beforeEach(() => {
  clearCookies();
});

afterEach(() => {
  clearCookies();
});

describe("CookieConsentBanner", () => {
  it("shows the banner when no cookie is present", () => {
    render(<CookieConsentBanner />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("title")).toBeInTheDocument();
  });

  it("does not show the banner when a valid consent cookie is present", () => {
    setConsentCookie({
      essential: true,
      analytics: false,
      preferences: false,
      version: "1.0",
      timestamp: Date.now(),
    });
    render(<CookieConsentBanner />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("saves cookie and hides banner on 'Accept All'", () => {
    render(<CookieConsentBanner />);
    fireEvent.click(screen.getByText("acceptAll"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.cookie).toContain(COOKIE_NAME);
    const match = document.cookie.split("; ").find((row) => row.startsWith(`${COOKIE_NAME}=`));
    const prefs = JSON.parse(decodeURIComponent(match!.split("=").slice(1).join("="))) as {
      analytics: boolean;
      preferences: boolean;
    };
    expect(prefs.analytics).toBe(true);
    expect(prefs.preferences).toBe(true);
  });

  it("saves cookie with only essential on 'Essential Only'", () => {
    render(<CookieConsentBanner />);
    fireEvent.click(screen.getByText("acceptEssential"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const match = document.cookie.split("; ").find((row) => row.startsWith(`${COOKIE_NAME}=`));
    const prefs = JSON.parse(decodeURIComponent(match!.split("=").slice(1).join("="))) as {
      analytics: boolean;
      preferences: boolean;
      essential: boolean;
    };
    expect(prefs.analytics).toBe(false);
    expect(prefs.preferences).toBe(false);
    expect(prefs.essential).toBe(true);
  });

  it("shows customize options when 'Customize' is clicked", () => {
    render(<CookieConsentBanner />);
    fireEvent.click(screen.getByText("customize"));
    // Checkboxes for analytics and preferences should now appear
    const checkboxes = screen.getAllByRole("checkbox");
    // essential (disabled) + analytics + preferences = 3 checkboxes
    expect(checkboxes.length).toBeGreaterThanOrEqual(3);
  });

  it("saves cookie with custom preferences on 'Save Preferences'", () => {
    render(<CookieConsentBanner />);
    fireEvent.click(screen.getByText("customize"));

    // Check analytics checkbox
    const checkboxes = screen.getAllByRole("checkbox");
    const analyticsCheckbox = checkboxes[1]; // index 0 = essential (disabled), 1 = analytics
    if (analyticsCheckbox) {
      fireEvent.click(analyticsCheckbox);
    }

    fireEvent.click(screen.getByText("save"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const match = document.cookie.split("; ").find((row) => row.startsWith(`${COOKIE_NAME}=`));
    const prefs = JSON.parse(decodeURIComponent(match!.split("=").slice(1).join("="))) as {
      analytics: boolean;
      preferences: boolean;
    };
    expect(prefs.analytics).toBe(true);
    expect(prefs.preferences).toBe(false);
  });
});
