import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotificationPreferencesMatrix } from "./NotificationPreferencesMatrix";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/db/queries/notification-preferences", () => ({
  DEFAULT_PREFERENCES: {
    message: { inApp: true, email: true, push: true },
    mention: { inApp: true, email: false, push: true },
    group_activity: { inApp: true, email: false, push: false },
    event_reminder: { inApp: true, email: true, push: true },
    post_interaction: { inApp: true, email: false, push: false },
    admin_announcement: { inApp: true, email: true, push: true },
  },
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ data: { preferences: {} } }),
  });
});

describe("NotificationPreferencesMatrix", () => {
  it("renders matrix rows for all 6 configurable types", async () => {
    render(<NotificationPreferencesMatrix />, { wrapper });

    await waitFor(() => {
      // The matrix should show rows for all 6 types
      expect(screen.getByText("types.message")).toBeInTheDocument();
      expect(screen.getByText("types.mention")).toBeInTheDocument();
      expect(screen.getByText("types.group_activity")).toBeInTheDocument();
      expect(screen.getByText("types.event_reminder")).toBeInTheDocument();
      expect(screen.getByText("types.post_interaction")).toBeInTheDocument();
      expect(screen.getByText("types.admin_announcement")).toBeInTheDocument();
    });
  });

  it("shows column headers for all 3 channels", async () => {
    render(<NotificationPreferencesMatrix />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText("channels.in_app")).toBeInTheDocument();
      expect(screen.getByText("channels.email")).toBeInTheDocument();
      expect(screen.getByText("channels.push")).toBeInTheDocument();
    });
  });

  it("shows digest select dropdowns for email column", async () => {
    render(<NotificationPreferencesMatrix />, { wrapper });

    await waitFor(() => {
      // Each row should have a digest select
      const selects = screen.getAllByRole("combobox");
      expect(selects.length).toBeGreaterThanOrEqual(6);
    });
  });

  it("reflects loaded preferences from API", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          preferences: {
            message: {
              channelInApp: true,
              channelEmail: false,
              channelPush: true,
              digestMode: "daily",
              quietHoursStart: null,
              quietHoursEnd: null,
              quietHoursTimezone: "UTC",
              lastDigestAt: null,
            },
          },
        },
      }),
    });

    render(<NotificationPreferencesMatrix />, { wrapper });

    await waitFor(() => {
      // Should find "daily" selected for message digest
      const selects = screen.getAllByRole("combobox");
      const dailySelect = selects.find((s) => (s as HTMLSelectElement).value === "daily");
      expect(dailySelect).toBeDefined();
    });
  });

  it("calls PUT endpoint when switch is toggled", async () => {
    render(<NotificationPreferencesMatrix />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText("types.message")).toBeInTheDocument();
    });

    // Find a push toggle (not disabled) and click it
    const toggles = screen.getAllByRole("switch");
    const enabledToggle = toggles.find((t) => !t.hasAttribute("disabled"));
    expect(enabledToggle).toBeDefined();
    if (enabledToggle) {
      fireEvent.click(enabledToggle);
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          "/api/v1/user/notification-preferences",
          expect.objectContaining({ method: "PUT" }),
        );
      });
    }
  });
});
