// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/test-utils";

vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string) => `${ns}.${key}`,
}));

const mockUseEventMeeting = vi.fn();
vi.mock("@/features/events/hooks/use-event-meeting", () => ({
  useEventMeeting: (...args: unknown[]) => mockUseEventMeeting(...args),
}));

const mockUseServiceHealth = vi.fn();
vi.mock("@/lib/service-health", () => ({
  useServiceHealth: () => mockUseServiceHealth(),
}));

// Mock next/dynamic so it doesn't try to load Daily SDK in tests
vi.mock("next/dynamic", () => ({
  default: (_fn: unknown, opts?: { loading?: () => React.ReactNode }) => {
    // Return the loading component as the dynamic component for SSR fallback testing
    const DynamicFallback = () => (opts?.loading ? opts.loading() : <div>Loading...</div>);
    DynamicFallback.displayName = "DynamicFallback";
    return DynamicFallback;
  },
}));

vi.mock("@/features/events/components/DailyMeetingView", () => ({
  DailyMeetingView: ({ onLeave }: { onLeave: () => void }) => (
    <div data-testid="daily-meeting-view">
      <button onClick={onLeave}>Leave Meeting</button>
    </div>
  ),
  NetworkQualityBadge: ({ quality }: { quality: string | null }) =>
    quality ? <span data-testid="network-badge">{quality}</span> : null,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

import { EventMeetingPanel } from "./EventMeetingPanel";

const defaultMeeting = {
  meetingState: "idle" as const,
  networkQuality: null,
  joinToken: null,
  roomUrl: null,
  error: null,
  handleJoin: vi.fn(),
  handleLeave: vi.fn(),
  handleNetworkQualityChange: vi.fn(),
  handleJoinedMeeting: vi.fn(),
};

describe("EventMeetingPanel", () => {
  beforeEach(() => {
    mockUseEventMeeting.mockReset();
    mockUseEventMeeting.mockReturnValue({ ...defaultMeeting });
    // Default: video available
    mockUseServiceHealth.mockReturnValue({
      chatAvailable: true,
      videoAvailable: true,
      degradedServices: [],
    });
  });

  it("renders join button in idle state", () => {
    render(<EventMeetingPanel eventId="event-1" />);
    expect(screen.getByText("Events.video.joinButton")).toBeInTheDocument();
  });

  it("renders loading state with skeleton", () => {
    mockUseEventMeeting.mockReturnValue({ ...defaultMeeting, meetingState: "loading" });
    render(<EventMeetingPanel eventId="event-1" />);
    expect(screen.getByText("Events.video.joinButtonLoading")).toBeInTheDocument();
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
  });

  it("renders nothing in left state", () => {
    mockUseEventMeeting.mockReturnValue({ ...defaultMeeting, meetingState: "left" });
    const { container } = render(<EventMeetingPanel eventId="event-1" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders network quality badge when quality is set", () => {
    mockUseEventMeeting.mockReturnValue({
      ...defaultMeeting,
      meetingState: "active",
      networkQuality: "low",
      joinToken: "tok",
      roomUrl: "https://test.daily.co/room",
    });
    render(<EventMeetingPanel eventId="event-1" />);
    expect(screen.getByTestId("network-badge")).toBeInTheDocument();
    expect(screen.getByTestId("network-badge").textContent).toBe("low");
  });

  it("calls handleJoin when join button is clicked", () => {
    const handleJoin = vi.fn();
    mockUseEventMeeting.mockReturnValue({ ...defaultMeeting, handleJoin });
    render(<EventMeetingPanel eventId="event-1" />);
    screen.getByText("Events.video.joinButton").click();
    expect(handleJoin).toHaveBeenCalledTimes(1);
  });

  it("shows error message in idle state when error is set", () => {
    mockUseEventMeeting.mockReturnValue({
      ...defaultMeeting,
      error: "You must be registered to join this event",
    });
    render(<EventMeetingPanel eventId="event-1" />);
    expect(screen.getByText("You must be registered to join this event")).toBeInTheDocument();
  });

  it("shows disabled join button when video is unavailable", () => {
    mockUseServiceHealth.mockReturnValue({
      chatAvailable: true,
      videoAvailable: false,
      degradedServices: ["video"],
    });

    render(<EventMeetingPanel eventId="event-1" />);

    const button = screen.getByRole("button", { name: "Events.video.joinButton" });
    expect(button).toBeDisabled();
    expect(screen.getByText("Events.videoUnavailable")).toBeInTheDocument();
  });
});
