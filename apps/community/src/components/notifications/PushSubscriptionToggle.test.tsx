import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockUsePushSubscription = vi.fn();
vi.mock("@/hooks/use-push-subscription", () => ({
  usePushSubscription: () => mockUsePushSubscription(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      enableLabel: "Enable push notifications",
      unsupportedBrowser: "Your browser does not support push notifications",
      permissionDenied:
        "Push notifications are blocked. Update your browser settings to enable them.",
      sectionTitle: "Push Notifications",
    };
    return map[key] ?? key;
  },
}));

import { PushSubscriptionToggle } from "./PushSubscriptionToggle";

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("PushSubscriptionToggle", () => {
  it("shows unsupported message when status is 'unsupported'", () => {
    mockUsePushSubscription.mockReturnValue({
      status: "unsupported",
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    });

    render(<PushSubscriptionToggle />);

    expect(screen.getByText("Enable push notifications")).toBeInTheDocument();
    expect(
      screen.getByText("Your browser does not support push notifications"),
    ).toBeInTheDocument();
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeDisabled();
  });

  it("shows denied message when status is 'denied'", () => {
    mockUsePushSubscription.mockReturnValue({
      status: "denied",
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    });

    render(<PushSubscriptionToggle />);

    expect(screen.getByText("Enable push notifications")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Push notifications are blocked. Update your browser settings to enable them.",
      ),
    ).toBeInTheDocument();
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeDisabled();
  });

  it("shows enabled checked checkbox when status is 'subscribed'", () => {
    mockUsePushSubscription.mockReturnValue({
      status: "subscribed",
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    });

    render(<PushSubscriptionToggle />);

    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    expect(checkbox).not.toBeDisabled();
  });

  it("shows enabled unchecked checkbox when status is 'unsubscribed'", () => {
    mockUsePushSubscription.mockReturnValue({
      status: "unsubscribed",
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    });

    render(<PushSubscriptionToggle />);

    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(checkbox).not.toBeDisabled();
  });

  it("shows disabled checkbox when status is 'loading'", () => {
    mockUsePushSubscription.mockReturnValue({
      status: "loading",
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    });

    render(<PushSubscriptionToggle />);

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeDisabled();
  });
});
