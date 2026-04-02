// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/test-utils";
import { GroupEventCard } from "./GroupEventCard";
import type { EventListItem } from "@igbo/db/queries/events";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => `Events.${key}`,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("./EventFormatBadge", () => ({
  EventFormatBadge: ({ format }: { format: string }) => <span>{`Events.format.${format}`}</span>,
}));

const mockEvent: EventListItem = {
  id: "event-42",
  title: "Group Meetup",
  description: null,
  creatorId: "creator-1",
  groupId: "group-1",
  eventType: "group",
  format: "virtual",
  location: null,
  meetingLink: "https://daily.co/room",
  timezone: "UTC",
  startTime: new Date("2030-08-15T14:00:00Z"),
  endTime: new Date("2030-08-15T15:00:00Z"),
  durationMinutes: 60,
  registrationLimit: null,
  attendeeCount: 10,
  recurrencePattern: "none",
  recurrenceParentId: null,
  status: "upcoming",
  dateChangeType: null,
  dateChangeComment: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("GroupEventCard", () => {
  it("renders event title as link to /events/[id]", () => {
    render(<GroupEventCard event={mockEvent} />);
    const link = screen.getByRole("link", { name: "Group Meetup" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/events/event-42");
  });

  it("renders formatted date string", () => {
    render(<GroupEventCard event={mockEvent} />);
    // Date is formatted via Intl.DateTimeFormat — just verify some date text is present
    const container = document.body;
    expect(container.textContent).toMatch(/Aug|2030/);
  });

  it("renders EventFormatBadge", () => {
    render(<GroupEventCard event={mockEvent} />);
    expect(screen.getByText("Events.format.virtual")).toBeInTheDocument();
  });

  it("shows amber 'Postponed' badge when dateChangeType='postponed'", () => {
    render(<GroupEventCard event={{ ...mockEvent, dateChangeType: "postponed" }} />);
    expect(screen.getByText("Events.dateChange.postponed")).toBeInTheDocument();
  });

  it("shows blue 'Brought Forward' badge when dateChangeType='preponed'", () => {
    render(<GroupEventCard event={{ ...mockEvent, dateChangeType: "preponed" }} />);
    expect(screen.getByText("Events.dateChange.preponed")).toBeInTheDocument();
  });

  it("shows no badge when dateChangeType is null", () => {
    render(<GroupEventCard event={{ ...mockEvent, dateChangeType: null }} />);
    expect(screen.queryByText("Events.dateChange.postponed")).not.toBeInTheDocument();
    expect(screen.queryByText("Events.dateChange.preponed")).not.toBeInTheDocument();
  });
});
