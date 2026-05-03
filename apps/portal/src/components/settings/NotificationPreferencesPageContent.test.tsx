// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { axe, toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

// ── Radix Switch + ResizeObserver polyfill ────────────────────────────────────
beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
});

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Use real catalog from config
vi.mock("@igbo/config/notifications", async () => {
  const actual = await vi.importActual<typeof import("@igbo/config/notifications")>(
    "@igbo/config/notifications",
  );
  return actual;
});

// ── Mock fetch ────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();

beforeAll(() => {
  global.fetch = mockFetch;
});

// Build a realistic preferences + catalog response
function makePrefsResponse(
  userPrefs: Record<
    string,
    Partial<{ channelInApp: boolean; channelPush: boolean; channelEmail: boolean }>
  > = {},
) {
  // Import real catalog to build merged preferences
  const { PORTAL_NOTIFICATION_CATALOG, PORTAL_NOTIFICATION_EVENT_TYPES } =
    require("@igbo/config/notifications") as typeof import("@igbo/config/notifications");

  const preferences: Record<
    string,
    { channelInApp: boolean; channelPush: boolean; channelEmail: boolean; digestMode: string }
  > = {};
  for (const eventType of PORTAL_NOTIFICATION_EVENT_TYPES) {
    const catalogEntry = PORTAL_NOTIFICATION_CATALOG[eventType];
    const override = userPrefs[eventType] ?? {};
    preferences[eventType] = {
      channelInApp: override.channelInApp ?? catalogEntry.defaultChannels.inApp,
      channelPush: override.channelPush ?? catalogEntry.defaultChannels.push,
      channelEmail: override.channelEmail ?? catalogEntry.defaultChannels.email,
      digestMode: "none",
    };
  }

  return {
    data: {
      preferences,
      catalog: PORTAL_NOTIFICATION_CATALOG,
    },
  };
}

function makeQuietHoursResponse(
  values: { start: string | null; end: string | null; timezone: string | null } = {
    start: null,
    end: null,
    timezone: null,
  },
) {
  return { data: values };
}

function setupFetchMocks(prefsData = makePrefsResponse(), quietData = makeQuietHoursResponse()) {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes("quiet-hours")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(quietData),
      } as Response);
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(prefsData),
    } as Response);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setupFetchMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Import component under test ───────────────────────────────────────────────
import { NotificationPreferencesPageContent } from "./NotificationPreferencesPageContent";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("NotificationPreferencesPageContent", () => {
  it("renders all three tier sections after loading", async () => {
    render(<NotificationPreferencesPageContent />);

    await waitFor(() => {
      expect(screen.getByTestId("tier-system-critical")).toBeInTheDocument();
      expect(screen.getByTestId("tier-high")).toBeInTheDocument();
      expect(screen.getByTestId("tier-low")).toBeInTheDocument();
    });
  });

  it("catalog grouping: 2 system-critical, 8 high, 1+ low event type rows", async () => {
    render(<NotificationPreferencesPageContent />);

    await waitFor(() => {
      // System-critical: portal.application.submitted, portal.job.rejected
      const systemSection = screen.getByTestId("tier-system-critical").closest("section");
      expect(systemSection).toBeDefined();
      const systemRows = systemSection!.querySelectorAll("[data-testid^='category-row-']");
      expect(systemRows).toHaveLength(2);

      // High priority: 8 events
      const highSection = screen.getByTestId("tier-high").closest("section");
      const highRows = highSection!.querySelectorAll("[data-testid^='category-row-']");
      expect(highRows).toHaveLength(8);

      // Low priority: 2 events
      const lowSection = screen.getByTestId("tier-low").closest("section");
      const lowRows = lowSection!.querySelectorAll("[data-testid^='category-row-']");
      expect(lowRows).toHaveLength(2);
    });
  });

  it("system-critical toggles are disabled (cannot be interacted with)", async () => {
    render(<NotificationPreferencesPageContent />);

    await waitFor(() => {
      const toggle = screen.getByTestId("toggle-portal.application.submitted-inApp");
      expect(toggle).toBeDisabled();
    });

    // All three channels should be disabled for system-critical
    const pushToggle = screen.getByTestId("toggle-portal.application.submitted-push");
    const emailToggle = screen.getByTestId("toggle-portal.application.submitted-email");
    expect(pushToggle).toBeDisabled();
    expect(emailToggle).toBeDisabled();
  });

  it("high-priority toggles are enabled (interactive)", async () => {
    render(<NotificationPreferencesPageContent />);

    await waitFor(() => {
      const toggle = screen.getByTestId("toggle-portal.application.status_changed-push");
      expect(toggle).not.toBeDisabled();
    });
  });

  it("low-priority toggles are enabled (interactive)", async () => {
    render(<NotificationPreferencesPageContent />);

    await waitFor(() => {
      const toggle = screen.getByTestId("toggle-portal.saved_search.new_results-inApp");
      expect(toggle).not.toBeDisabled();
    });
  });

  it("at-least-one guard: shows error toast and does NOT send PUT when last channel disabled", async () => {
    const user = userEvent.setup();
    // Give a preference where only inApp is on for a high-priority event
    const prefsData = makePrefsResponse({
      "portal.application.status_changed": {
        channelInApp: true,
        channelPush: false,
        channelEmail: false,
      },
    });
    setupFetchMocks(prefsData);

    render(<NotificationPreferencesPageContent />);

    await waitFor(() => {
      expect(
        screen.getByTestId("toggle-portal.application.status_changed-inApp"),
      ).toBeInTheDocument();
    });

    // Attempt to disable the last remaining channel (inApp)
    const inAppToggle = screen.getByTestId("toggle-portal.application.status_changed-inApp");
    await user.click(inAppToggle);

    // Error toast should be shown
    expect(mockToastError).toHaveBeenCalledWith("atLeastOneRequired");

    // No PUT request should have been sent
    const putCalls = mockFetch.mock.calls.filter((c: unknown[]) => {
      const req = c[1] as RequestInit | undefined;
      return (
        req?.method === "PUT" &&
        typeof c[0] === "string" &&
        (c[0] as string).includes("preferences")
      );
    });
    expect(putCalls).toHaveLength(0);
  });

  it("toggle saves via PUT request on successful toggle (happy path)", async () => {
    const user = userEvent.setup();

    // Push is enabled by default for portal.application.status_changed
    render(<NotificationPreferencesPageContent />);

    await waitFor(() => {
      expect(
        screen.getByTestId("toggle-portal.application.status_changed-push"),
      ).toBeInTheDocument();
    });

    // Mock PUT to succeed
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: { updated: true } }),
      } as Response),
    );

    // Disable push for status_changed (it currently has both inApp and email on, so at-least-one is satisfied)
    const pushToggle = screen.getByTestId("toggle-portal.application.status_changed-push");
    await user.click(pushToggle);

    await waitFor(() => {
      const putCalls = mockFetch.mock.calls.filter((c: unknown[]) => {
        const req = c[1] as RequestInit | undefined;
        return req?.method === "PUT";
      });
      expect(putCalls.length).toBeGreaterThan(0);
    });

    expect(mockToastSuccess).toHaveBeenCalledWith("saveSuccess");
  });

  it("quiet hours section renders with inputs", async () => {
    render(<NotificationPreferencesPageContent />);

    await waitFor(() => {
      expect(screen.getByTestId("quiet-hours-start")).toBeInTheDocument();
      expect(screen.getByTestId("quiet-hours-end")).toBeInTheDocument();
      expect(screen.getByTestId("quiet-hours-timezone")).toBeInTheDocument();
    });
  });

  it("quiet hours save sends PUT request with correct data", async () => {
    const user = userEvent.setup();
    render(<NotificationPreferencesPageContent />);

    await waitFor(() => {
      expect(screen.getByTestId("quiet-hours-start")).toBeInTheDocument();
    });

    // Set time values
    const startInput = screen.getByTestId("quiet-hours-start");
    const endInput = screen.getByTestId("quiet-hours-end");
    fireEvent.change(startInput, { target: { value: "22:00" } });
    fireEvent.change(endInput, { target: { value: "08:00" } });

    // Mock the PUT for quiet hours
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: { updated: true } }),
      } as Response),
    );

    const saveBtn = screen.getByTestId("quiet-hours-save");
    await user.click(saveBtn);

    await waitFor(() => {
      const putCall = mockFetch.mock.calls.find((c: unknown[]) => {
        const req = c[1] as RequestInit | undefined;
        return (
          req?.method === "PUT" &&
          typeof c[0] === "string" &&
          (c[0] as string).includes("quiet-hours")
        );
      });
      expect(putCall).toBeDefined();
      const body = JSON.parse((putCall![1] as RequestInit).body as string);
      expect(body.start).toBe("22:00");
      expect(body.end).toBe("08:00");
    });
  });

  it("quiet hours clear sends PUT with null start/end", async () => {
    const user = userEvent.setup();
    render(<NotificationPreferencesPageContent />);

    await waitFor(() => {
      expect(screen.getByTestId("quiet-hours-clear")).toBeInTheDocument();
    });

    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: { updated: true } }),
      } as Response),
    );

    const clearBtn = screen.getByTestId("quiet-hours-clear");
    await user.click(clearBtn);

    await waitFor(() => {
      const putCall = mockFetch.mock.calls.find((c: unknown[]) => {
        const req = c[1] as RequestInit | undefined;
        return (
          req?.method === "PUT" &&
          typeof c[0] === "string" &&
          (c[0] as string).includes("quiet-hours")
        );
      });
      expect(putCall).toBeDefined();
      const body = JSON.parse((putCall![1] as RequestInit).body as string);
      expect(body.start).toBeNull();
      expect(body.end).toBeNull();
    });
  });

  it("page title is an h1 (accessibility — heading order)", async () => {
    render(<NotificationPreferencesPageContent />);

    await waitFor(() => {
      const h1 = screen.getByRole("heading", { level: 1 });
      expect(h1).toBeInTheDocument();
    });
  });

  it("renders error state when initial fetch fails", async () => {
    mockFetch.mockImplementation(() => Promise.resolve({ ok: false, status: 500 } as Response));

    render(<NotificationPreferencesPageContent />);

    await waitFor(() => {
      expect(screen.getByText("loadError")).toBeInTheDocument();
    });
  });

  it("no heading-order axe violations after loading", async () => {
    const { container } = render(<NotificationPreferencesPageContent />);

    await waitFor(() => {
      expect(screen.getByTestId("tier-system-critical")).toBeInTheDocument();
    });

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  }, 30000);
});
