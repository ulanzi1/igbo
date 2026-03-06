// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test/test-utils";

vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string) => `${ns}.${key}`,
}));

const mockUseQuery = vi.fn();
const mockUseMutation = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
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

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="badge">{children}</span>
  ),
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

import { AttendanceCheckIn } from "./AttendanceCheckIn";

describe("AttendanceCheckIn", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
    mockUseMutation.mockReset();
    mockUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });
  });

  it("renders loading state (skeleton) while fetching", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true });
    render(<AttendanceCheckIn eventId="event-1" />);
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
  });

  it("renders empty state when no attendees", () => {
    mockUseQuery.mockReturnValue({
      data: { attendees: [] },
      isLoading: false,
    });
    render(<AttendanceCheckIn eventId="event-1" />);
    expect(screen.getByText("Events.checkIn.noAttendees")).toBeInTheDocument();
  });

  it("renders attendee list with registered attendees showing Mark Attended button", () => {
    mockUseQuery.mockReturnValue({
      data: {
        attendees: [
          { userId: "user-1", displayName: "Ada Eze", status: "registered", joinedAt: null },
          {
            userId: "user-2",
            displayName: "Emeka Obi",
            status: "attended",
            joinedAt: "2030-01-01",
          },
        ],
      },
      isLoading: false,
    });
    render(<AttendanceCheckIn eventId="event-1" />);
    expect(screen.getByText("Ada Eze")).toBeInTheDocument();
    expect(screen.getByText("Emeka Obi")).toBeInTheDocument();
    expect(screen.getByText("Events.checkIn.markAttended")).toBeInTheDocument();
    expect(screen.getByText("Events.checkIn.alreadyAttended")).toBeInTheDocument();
  });

  it("calls mutate with userId when Mark Attended button is clicked", () => {
    const mutate = vi.fn();
    mockUseMutation.mockReturnValue({ mutate, isPending: false });
    mockUseQuery.mockReturnValue({
      data: {
        attendees: [
          { userId: "user-1", displayName: "Ada Eze", status: "registered", joinedAt: null },
        ],
      },
      isLoading: false,
    });
    render(<AttendanceCheckIn eventId="event-1" />);
    fireEvent.click(screen.getByText("Events.checkIn.markAttended"));
    expect(mutate).toHaveBeenCalledWith("user-1");
  });

  it("shows badge for already-attended attendees", () => {
    mockUseQuery.mockReturnValue({
      data: {
        attendees: [
          {
            userId: "user-2",
            displayName: "Emeka Obi",
            status: "attended",
            joinedAt: "2030-01-01",
          },
        ],
      },
      isLoading: false,
    });
    render(<AttendanceCheckIn eventId="event-1" />);
    expect(screen.getByTestId("badge")).toBeInTheDocument();
    expect(screen.getByTestId("badge").textContent).toBe("Events.checkIn.alreadyAttended");
  });
});
