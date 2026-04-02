// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@/test/test-utils";
import { expectNoA11yViolations } from "@/test/a11y-utils";

const mockUseSession = vi.fn();
vi.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
}));

const mockUseQuery = vi.fn();
const mockUseMutation = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${ns}.${key}(${JSON.stringify(params)})`;
    return `${ns}.${key}`;
  },
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="alert-dialog">{children}</div>
  ),
  AlertDialogTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="alert-dialog-content">{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogAction: ({
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
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));

import { RSVPButton } from "./RSVPButton";

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSession.mockReturnValue({ data: { user: { id: "user-1" } } });
  mockUseQuery.mockReturnValue({ data: undefined, isLoading: false });
  mockUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });
});

describe("RSVPButton", () => {
  it("renders sign-in link when no session", () => {
    mockUseSession.mockReturnValue({ data: null });
    render(<RSVPButton eventId="event-1" registrationLimit={null} attendeeCount={0} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/auth/sign-in");
    expect(screen.getByText("Events.rsvp.signInToRsvp")).toBeInTheDocument();
  });

  it("renders loading button when query is loading", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true });
    render(<RSVPButton eventId="event-1" registrationLimit={null} attendeeCount={0} />);
    expect(screen.getByText("Common.loading")).toBeInTheDocument();
  });

  it("renders RSVP button when status is null (no RSVP yet)", () => {
    mockUseQuery.mockReturnValue({
      data: { status: null, waitlistPosition: null },
      isLoading: false,
    });
    render(<RSVPButton eventId="event-1" registrationLimit={null} attendeeCount={0} />);
    expect(screen.getByText("Events.rsvp.button")).toBeInTheDocument();
  });

  it("renders registered badge when status is registered", () => {
    mockUseQuery.mockReturnValue({
      data: { status: "registered", waitlistPosition: null },
      isLoading: false,
    });
    render(<RSVPButton eventId="event-1" registrationLimit={null} attendeeCount={0} />);
    expect(screen.getByText("Events.rsvp.alreadyRegistered")).toBeInTheDocument();
  });

  it("renders waitlisted badge with position when status is waitlisted", () => {
    mockUseQuery.mockReturnValue({
      data: { status: "waitlisted", waitlistPosition: 2 },
      isLoading: false,
    });
    render(<RSVPButton eventId="event-1" registrationLimit={null} attendeeCount={0} />);
    expect(screen.getByText('Events.rsvp.alreadyWaitlisted({"position":2})')).toBeInTheDocument();
  });

  it("renders Cancel RSVP button when registered", () => {
    mockUseQuery.mockReturnValue({
      data: { status: "registered", waitlistPosition: null },
      isLoading: false,
    });
    render(<RSVPButton eventId="event-1" registrationLimit={null} attendeeCount={0} />);
    // cancelButton text appears twice: trigger button + confirm action button in dialog
    expect(screen.getAllByText("Events.rsvp.cancelButton")).toHaveLength(2);
  });

  it("shows spots left text when fewer than 10 spots available", () => {
    mockUseQuery.mockReturnValue({
      data: { status: null, waitlistPosition: null },
      isLoading: false,
    });
    // registrationLimit=15, attendeeCount=8 → spotsLeft=7 (< 10 and > 0)
    render(<RSVPButton eventId="event-1" registrationLimit={15} attendeeCount={8} />);
    expect(screen.getByText('Events.rsvp.spotsLeft({"count":7})')).toBeInTheDocument();
  });

  it("calls rsvpMutation.mutate when RSVP button is clicked", () => {
    const mutateFn = vi.fn();
    mockUseMutation.mockReturnValue({ mutate: mutateFn, isPending: false });
    mockUseQuery.mockReturnValue({
      data: { status: null, waitlistPosition: null },
      isLoading: false,
    });
    render(<RSVPButton eventId="event-1" registrationLimit={null} attendeeCount={0} />);
    fireEvent.click(screen.getByText("Events.rsvp.button"));
    expect(mutateFn).toHaveBeenCalledTimes(1);
  });

  it("calls cancelMutation.mutate when cancel confirm button is clicked", () => {
    const rsvpMutateFn = vi.fn();
    const cancelMutateFn = vi.fn();
    let callCount = 0;
    mockUseMutation.mockImplementation(() => {
      callCount++;
      if (callCount % 2 === 1) return { mutate: rsvpMutateFn, isPending: false };
      return { mutate: cancelMutateFn, isPending: false };
    });
    mockUseQuery.mockReturnValue({
      data: { status: "registered", waitlistPosition: null },
      isLoading: false,
    });
    render(<RSVPButton eventId="event-1" registrationLimit={null} attendeeCount={0} />);
    // The confirm action button inside AlertDialog has the cancelButton text
    const confirmButtons = screen.getAllByText("Events.rsvp.cancelButton");
    // Click the confirm action button (second instance)
    fireEvent.click(confirmButtons[1]);
    expect(cancelMutateFn).toHaveBeenCalledTimes(1);
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <RSVPButton eventId="event-1" registrationLimit={null} attendeeCount={0} />,
    );
    await expectNoA11yViolations(container);
  });
});
