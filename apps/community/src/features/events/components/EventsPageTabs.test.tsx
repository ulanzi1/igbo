// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/test-utils";
import type { EventListItem } from "@igbo/db/queries/events";

const mockUseSession = vi.fn();
vi.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
}));

const mockUseQuery = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string, params?: Record<string, unknown>) => {
    if (ns === "Events" && key === "myRsvps.cancelledReason" && params?.reason) {
      return `Reason: ${String(params.reason)}`;
    }
    if (ns === "Common") return `Common.${key}`;
    return `Events.${key}`;
  },
}));

vi.mock("./EventCard", () => ({
  EventCard: ({ event }: { event: { title: string } }) => (
    <div data-testid="event-card">{event.title}</div>
  ),
}));

vi.mock("./RSVPButton", () => ({
  RSVPButton: ({ eventId }: { eventId: string }) => <div data-testid={`rsvp-${eventId}`} />,
}));

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => <div role="tablist">{children}</div>,
  TabsTrigger: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <button role="tab" data-value={value}>
      {children}
    </button>
  ),
  TabsContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const mockEvent: EventListItem = {
  id: "event-1",
  title: "Test Event",
  description: null,
  creatorId: "user-1",
  groupId: null,
  eventType: "general",
  format: "virtual",
  location: null,
  meetingLink: null,
  timezone: "UTC",
  startTime: new Date("2030-06-15T18:00:00Z"),
  endTime: new Date("2030-06-15T21:00:00Z"),
  durationMinutes: 180,
  registrationLimit: null,
  attendeeCount: 5,
  recurrencePattern: "none",
  recurrenceParentId: null,
  status: "upcoming",
  dateChangeType: null,
  dateChangeComment: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

import { EventsPageTabs } from "./EventsPageTabs";

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSession.mockReturnValue({ data: null });
  mockUseQuery.mockReturnValue({ data: undefined });
});

describe("EventsPageTabs", () => {
  it("renders upcoming tab with initial events", () => {
    render(<EventsPageTabs initialUpcomingEvents={[mockEvent]} />);
    expect(screen.getByText("Test Event")).toBeInTheDocument();
    expect(screen.getByTestId("event-card")).toBeInTheDocument();
  });

  it("shows empty state when no upcoming events", () => {
    render(<EventsPageTabs initialUpcomingEvents={[]} />);
    expect(screen.getByText("Events.list.empty")).toBeInTheDocument();
  });

  it("hides My RSVPs tab when no session", () => {
    mockUseSession.mockReturnValue({ data: null });
    render(<EventsPageTabs initialUpcomingEvents={[]} />);
    expect(screen.queryByText("Events.list.myRsvps")).not.toBeInTheDocument();
  });

  it("shows My RSVPs tab when session exists", () => {
    mockUseSession.mockReturnValue({ data: { user: { id: "user-1" } } });
    render(<EventsPageTabs initialUpcomingEvents={[]} />);
    expect(screen.getByText("Events.list.myRsvps")).toBeInTheDocument();
  });

  it("renders RSVPButton for each upcoming event", () => {
    render(<EventsPageTabs initialUpcomingEvents={[mockEvent]} />);
    expect(screen.getByTestId("rsvp-event-1")).toBeInTheDocument();
  });

  describe("My RSVPs tab — cancelled events", () => {
    const cancelledRsvp = {
      ...mockEvent,
      id: "cancelled-event-1",
      title: "Cancelled Event",
      status: "cancelled" as const,
      rsvpStatus: "cancelled" as const,
      waitlistPosition: null,
      cancellationReason: "Venue flooded",
    };

    beforeEach(() => {
      mockUseSession.mockReturnValue({ data: { user: { id: "user-1" } } });
    });

    it("shows 'Cancelled by organiser' badge for cancelled rsvpStatus events", () => {
      mockUseQuery
        .mockReturnValueOnce({ data: undefined }) // past query
        .mockReturnValueOnce({ data: { events: [cancelledRsvp] }, isError: false }); // myRsvps query
      render(<EventsPageTabs initialUpcomingEvents={[]} />);
      expect(screen.getByText("Events.myRsvps.cancelledBadge")).toBeInTheDocument();
    });

    it("renders cancellation reason text when cancellationReason is present", () => {
      mockUseQuery
        .mockReturnValueOnce({ data: undefined })
        .mockReturnValueOnce({ data: { events: [cancelledRsvp] }, isError: false });
      render(<EventsPageTabs initialUpcomingEvents={[]} />);
      expect(screen.getByText("Reason: Venue flooded")).toBeInTheDocument();
    });

    it("does NOT render RSVPButton for cancelled events", () => {
      mockUseQuery
        .mockReturnValueOnce({ data: undefined })
        .mockReturnValueOnce({ data: { events: [cancelledRsvp] }, isError: false });
      render(<EventsPageTabs initialUpcomingEvents={[]} />);
      expect(screen.queryByTestId("rsvp-cancelled-event-1")).not.toBeInTheDocument();
    });
  });
});
