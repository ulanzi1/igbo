// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/test-utils";
import { EventList } from "./EventList";
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
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("EventList", () => {
  it("renders list of EventCards when events provided", () => {
    render(<EventList events={[mockEvent, { ...mockEvent, id: "event-2", title: "Event 2" }]} />);
    expect(screen.getByText("Test Event")).toBeInTheDocument();
    expect(screen.getByText("Event 2")).toBeInTheDocument();
  });

  it("shows empty state when events array is empty", () => {
    render(<EventList events={[]} />);
    expect(screen.getByText("Events.list.empty")).toBeInTheDocument();
  });
});
