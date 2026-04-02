// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/test-utils";

const mockUseSession = vi.fn();
vi.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
}));

const mockUseQuery = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => `Events.${key}`,
  useLocale: () => "en",
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

import { UpcomingEventsWidget } from "./UpcomingEventsWidget";

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSession.mockReturnValue({ data: null });
  mockUseQuery.mockReturnValue({ data: undefined, isLoading: false });
});

describe("UpcomingEventsWidget", () => {
  it("returns null when no session", () => {
    const { container } = render(<UpcomingEventsWidget />);
    expect(container.firstChild).toBeNull();
  });

  it("renders three skeleton rows while loading", () => {
    mockUseSession.mockReturnValue({ data: { user: { id: "user-1" } } });
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true });
    render(<UpcomingEventsWidget />);
    expect(screen.getAllByTestId("skeleton")).toHaveLength(3);
  });

  it("shows empty state when no RSVP events", () => {
    mockUseSession.mockReturnValue({ data: { user: { id: "user-1" } } });
    mockUseQuery.mockReturnValue({ data: { events: [] }, isLoading: false });
    render(<UpcomingEventsWidget />);
    expect(screen.getByText("Events.widget.empty")).toBeInTheDocument();
  });

  it("renders event titles and view-all link when events exist", () => {
    mockUseSession.mockReturnValue({ data: { user: { id: "user-1" } } });
    mockUseQuery.mockReturnValue({
      data: {
        events: [
          {
            id: "event-1",
            title: "Community Night",
            startTime: new Date("2030-06-15T18:00:00Z"),
            timezone: "UTC",
            rsvpStatus: "registered",
            waitlistPosition: null,
          },
        ],
      },
      isLoading: false,
    });
    render(<UpcomingEventsWidget />);
    expect(screen.getByText("Community Night")).toBeInTheDocument();
    const viewAllLink = screen.getByText("Events.widget.viewAll").closest("a");
    expect(viewAllLink).toHaveAttribute("href", "/events");
  });
});
