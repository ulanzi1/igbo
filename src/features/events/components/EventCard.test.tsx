// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/test-utils";
import { EventCard } from "./EventCard";
import type { EventListItem } from "@/db/queries/events";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params && key === "detail.registered") return `${String(params.count)} registered`;
    return `Events.${key}`;
  },
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
  useRouter: vi.fn().mockReturnValue({ push: vi.fn() }),
}));

const mockEvent: EventListItem = {
  id: "event-1",
  title: "Igbo Cultural Night",
  description: null,
  creatorId: "user-1",
  groupId: null,
  eventType: "general",
  format: "in_person",
  location: null,
  meetingLink: null,
  timezone: "UTC",
  startTime: new Date("2030-06-15T18:00:00Z"),
  endTime: new Date("2030-06-15T21:00:00Z"),
  durationMinutes: 180,
  registrationLimit: null,
  attendeeCount: 42,
  recurrencePattern: "none",
  recurrenceParentId: null,
  status: "upcoming",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("EventCard", () => {
  it("renders event title and format badge", () => {
    render(<EventCard event={mockEvent} />);
    expect(screen.getByText("Igbo Cultural Night")).toBeInTheDocument();
    // format badge via EventFormatBadge — uses "Events.format.inPerson"
    expect(screen.getByText("Events.format.inPerson")).toBeInTheDocument();
  });

  it("renders correct format badge for 'in_person' format", () => {
    render(<EventCard event={mockEvent} />);
    expect(screen.getByText("Events.format.inPerson")).toBeInTheDocument();
  });

  it("shows 'Recurring Event' chip when recurrenceParentId is set", () => {
    render(<EventCard event={{ ...mockEvent, recurrenceParentId: "parent-1" }} />);
    expect(screen.getByText("Events.detail.seriesLabel")).toBeInTheDocument();
  });

  it("does not show edit actions when showEditActions=false", () => {
    render(<EventCard event={mockEvent} showEditActions={false} />);
    expect(screen.queryByText("Events.detail.editButton")).not.toBeInTheDocument();
  });
});
