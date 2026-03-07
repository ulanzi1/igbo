import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import NotificationsSettingsPage from "./page";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@tanstack/react-query", () => ({
  QueryClient: class MockQueryClient {},
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useQuery: vi.fn().mockReturnValue({ data: {}, isLoading: false }),
  useMutation: vi.fn().mockReturnValue({ mutate: vi.fn() }),
  useQueryClient: vi
    .fn()
    .mockReturnValue({
      cancelQueries: vi.fn(),
      setQueryData: vi.fn(),
      getQueryData: vi.fn(),
      invalidateQueries: vi.fn(),
    }),
}));

vi.mock("@/components/notifications/NotificationPreferencesMatrix", () => ({
  NotificationPreferencesMatrix: () => <div data-testid="matrix" />,
}));

vi.mock("@/components/notifications/QuietHoursForm", () => ({
  QuietHoursForm: () => <div data-testid="quiet-hours" />,
}));

describe("NotificationsSettingsPage", () => {
  it("wraps content in canonical max-w-2xl container (U1)", () => {
    const { container } = render(<NotificationsSettingsPage />);
    const main = container.querySelector("main");
    expect(main).not.toBeNull();
    expect(main?.className).toContain("max-w-2xl");
    expect(main?.className).toContain("px-4");
    expect(main?.className).toContain("py-8");
  });

  it("renders the preferences matrix section", () => {
    render(<NotificationsSettingsPage />);
    expect(screen.getByTestId("matrix")).toBeInTheDocument();
  });

  it("renders quiet hours section", () => {
    render(<NotificationsSettingsPage />);
    expect(screen.getByTestId("quiet-hours")).toBeInTheDocument();
  });

  it("does NOT render standalone push section (removed in B2/U4+U5)", () => {
    render(<NotificationsSettingsPage />);
    // push.sectionTitle was the standalone section heading — should not appear
    expect(screen.queryByText("push.sectionTitle")).not.toBeInTheDocument();
  });
});
