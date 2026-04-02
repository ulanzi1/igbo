// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const mockGetEventById = vi.fn();
const mockGetGroupById = vi.fn();
const mockNotFound = vi.fn();

vi.mock("next/navigation", () => ({
  notFound: () => {
    mockNotFound();
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async (ns?: string | { locale: string; namespace: string }) => {
    const namespace = typeof ns === "string" ? ns : ns?.namespace;
    return (key: string, params?: Record<string, unknown>) => {
      if (params && key === "detail.registered") return `${String(params.count)} registered`;
      return `${namespace}.${key}`;
    };
  },
  setRequestLocale: vi.fn(),
}));

vi.mock("@/db/queries/events", () => ({
  getEventById: (...args: unknown[]) => mockGetEventById(...args),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  cancelEvent: vi.fn(),
  listUpcomingEvents: vi.fn(),
  listGroupEvents: vi.fn(),
  getEventsByParentId: vi.fn(),
}));

vi.mock("@/db/queries/groups", () => ({
  getGroupById: (...args: unknown[]) => mockGetGroupById(...args),
  getGroupMember: vi.fn(),
  getGroupsForUserMembership: vi.fn(),
}));

vi.mock("@/features/events/components/EventFormatBadge", () => ({
  EventFormatBadge: ({ format }: { format: string }) => (
    <span data-testid="format-badge">{format}</span>
  ),
}));

vi.mock("@/features/events/components/EventStatusBadge", () => ({
  EventStatusBadge: ({ status }: { status: string }) => (
    <span data-testid="status-badge">{status}</span>
  ),
}));

vi.mock("@/features/events/components/EventMembershipGate", () => ({
  EventMembershipGate: () => <div data-testid="membership-gate">gate</div>,
}));

vi.mock("@/features/events/components/EventDetailActions", () => ({
  EventDetailActions: () => <div data-testid="detail-actions">actions</div>,
}));

vi.mock("@/features/events", () => ({
  RSVPButton: ({ eventId }: { eventId: string }) => <div data-testid={`rsvp-button-${eventId}`} />,
}));

import EventDetailPage from "./page";

const mockEvent = {
  id: "event-1",
  title: "Test Event",
  description: "A great event",
  creatorId: "user-1",
  groupId: null,
  eventType: "general" as const,
  format: "virtual" as const,
  location: null,
  meetingLink: "https://meet.example.com",
  timezone: "UTC",
  startTime: new Date("2030-06-15T18:00:00Z"),
  endTime: new Date("2030-06-15T21:00:00Z"),
  durationMinutes: 180,
  registrationLimit: 50,
  attendeeCount: 10,
  recurrencePattern: "none" as const,
  recurrenceParentId: null,
  status: "upcoming" as const,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("EventDetailPage", () => {
  beforeEach(() => {
    mockGetEventById.mockReset();
    mockGetGroupById.mockReset();
    mockNotFound.mockReset();

    mockGetEventById.mockResolvedValue(mockEvent);
    mockGetGroupById.mockResolvedValue(null);
  });

  it("renders event title and detail info", async () => {
    const Page = await EventDetailPage({
      params: Promise.resolve({ locale: "en", eventId: "event-1" }),
    });
    render(Page);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Test Event");
    expect(screen.getByText(/10 registered/)).toBeInTheDocument();
    expect(screen.getByTestId("format-badge")).toHaveTextContent("virtual");
  });

  it("calls notFound when event does not exist", async () => {
    mockGetEventById.mockResolvedValue(null);
    await expect(
      EventDetailPage({
        params: Promise.resolve({ locale: "en", eventId: "nonexistent" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockNotFound).toHaveBeenCalled();
  });

  it("calls notFound when event is soft-deleted", async () => {
    mockGetEventById.mockResolvedValue({ ...mockEvent, deletedAt: new Date() });
    await expect(
      EventDetailPage({
        params: Promise.resolve({ locale: "en", eventId: "event-1" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders EventMembershipGate for private group events", async () => {
    mockGetEventById.mockResolvedValue({ ...mockEvent, groupId: "group-1", eventType: "group" });
    mockGetGroupById.mockResolvedValue({ id: "group-1", visibility: "private" });
    const Page = await EventDetailPage({
      params: Promise.resolve({ locale: "en", eventId: "event-1" }),
    });
    render(Page);
    expect(screen.getByTestId("membership-gate")).toBeInTheDocument();
  });

  it("renders EventDetailActions for creator actions", async () => {
    const Page = await EventDetailPage({
      params: Promise.resolve({ locale: "en", eventId: "event-1" }),
    });
    render(Page);
    expect(screen.getByTestId("detail-actions")).toBeInTheDocument();
  });
});
