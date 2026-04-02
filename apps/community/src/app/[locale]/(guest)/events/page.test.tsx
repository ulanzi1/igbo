// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/test-utils";

vi.mock("next-intl/server", () => ({
  getTranslations: async (ns?: string | { locale: string; namespace: string }) => {
    const namespace = typeof ns === "string" ? ns : ns?.namespace;
    return (key: string) => `${namespace}.${key}`;
  },
  setRequestLocale: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/events",
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  redirect: vi.fn(),
  getPathname: vi.fn(),
}));

vi.mock("@igbo/db/queries/events", () => ({
  listUpcomingEvents: vi.fn().mockResolvedValue([]),
  createEvent: vi.fn(),
  getEventById: vi.fn(),
  updateEvent: vi.fn(),
  cancelEvent: vi.fn(),
  listGroupEvents: vi.fn(),
  getEventsByParentId: vi.fn(),
}));

vi.mock("@/features/events", () => ({
  EventsPageTabs: ({ initialUpcomingEvents }: { initialUpcomingEvents: unknown[] }) => (
    <div data-testid="event-list">
      {initialUpcomingEvents.length === 0
        ? "Events.list.empty"
        : `${initialUpcomingEvents.length} events`}
    </div>
  ),
}));

vi.mock("@/features/events/components/CreateEventButton", () => ({
  CreateEventButton: () => <button data-testid="create-event-btn">Create Event</button>,
}));

import { listUpcomingEvents } from "@igbo/db/queries/events";
import EventsPage from "./page";

describe("EventsPage", () => {
  beforeEach(() => {
    vi.mocked(listUpcomingEvents).mockResolvedValue([]);
  });

  it("renders page title and create button", async () => {
    const Page = await EventsPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Events.list.title");
    expect(screen.getByTestId("create-event-btn")).toBeInTheDocument();
  });

  it("has a single h1", async () => {
    const Page = await EventsPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("shows empty state when no events", async () => {
    vi.mocked(listUpcomingEvents).mockResolvedValue([]);
    const Page = await EventsPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page);
    expect(screen.getByTestId("event-list")).toHaveTextContent("Events.list.empty");
  });
});
