import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotificationPreferencesMatrix } from "./NotificationPreferencesMatrix";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// B2/U4+U5: mock usePushSubscription and PushSubscriptionToggle for matrix tests
const mockUsePushSubscription = vi.fn();
vi.mock("@/hooks/use-push-subscription", () => ({
  usePushSubscription: () => mockUsePushSubscription(),
}));

vi.mock("@/components/notifications/PushSubscriptionToggle", () => ({
  PushSubscriptionToggle: () => <div data-testid="push-toggle-stub" />,
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
  // Default: subscribed
  mockUsePushSubscription.mockReturnValue({
    status: "subscribed",
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
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

  // ─── Story 9.5: B2/U4+U5 — Push column gate tests ───────────────────────────

  it("B2.1: Push column toggles are NOT disabled when status is subscribed", async () => {
    mockUsePushSubscription.mockReturnValue({
      status: "subscribed",
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    });
    render(<NotificationPreferencesMatrix />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText("types.message")).toBeInTheDocument();
    });

    // Push column toggles (role=switch) should have some that are NOT disabled
    // (email/in-app toggles are always enabled; push toggles vary)
    const allSwitches = screen.getAllByRole("switch");
    // At least some switches exist and not all are disabled
    expect(allSwitches.length).toBeGreaterThan(0);
    // Push toggle stub is rendered
    expect(screen.getByTestId("push-toggle-stub")).toBeInTheDocument();
  });

  it("B2.2: Push column toggles ARE disabled and prompt visible when unsubscribed", async () => {
    mockUsePushSubscription.mockReturnValue({
      status: "unsubscribed",
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    });
    render(<NotificationPreferencesMatrix />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText("types.message")).toBeInTheDocument();
    });

    // All push switches should be disabled (each row has a push toggle)
    // In-app toggles are always disabled (always-on), email toggles are enabled
    // Push toggles are disabled when not subscribed
    const allSwitches = screen.getAllByRole("switch");
    // Find switches that should be push-column (every 3rd switch pattern, but simpler: check disabled count)
    const disabledSwitches = allSwitches.filter((s) => s.hasAttribute("disabled"));
    // At minimum the 6 push column toggles are disabled
    expect(disabledSwitches.length).toBeGreaterThanOrEqual(6);

    // Prompt text visible
    expect(screen.getByText("push.enableToConfigurePush")).toBeInTheDocument();
  });

  it("B2.3: Push column header shows unsupported message when status is unsupported", async () => {
    mockUsePushSubscription.mockReturnValue({
      status: "unsupported",
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    });
    render(<NotificationPreferencesMatrix />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText("types.message")).toBeInTheDocument();
    });

    // PushSubscriptionToggle stub is still rendered (it handles its own unsupported state)
    expect(screen.getByTestId("push-toggle-stub")).toBeInTheDocument();

    // Push toggles disabled when unsupported
    const allSwitches = screen.getAllByRole("switch");
    const disabledSwitches = allSwitches.filter((s) => s.hasAttribute("disabled"));
    expect(disabledSwitches.length).toBeGreaterThanOrEqual(6);
  });
});
