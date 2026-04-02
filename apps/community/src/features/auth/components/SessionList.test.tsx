import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test/test-utils";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, args?: Record<string, unknown>) => {
    if (args) return `${key} ${JSON.stringify(args)}`;
    return key;
  },
}));
vi.mock("@/features/auth/hooks/use-sessions", () => ({
  useSessions: vi.fn(),
  useRevokeSession: vi.fn(),
}));

import { SessionList } from "./SessionList";
import { useSessions, useRevokeSession } from "@/features/auth/hooks/use-sessions";

const mockRevokeMutate = vi.fn();

const MOCK_SESSIONS = [
  {
    id: "sess-1",
    deviceName: "Chrome on macOS",
    deviceIp: "1.2.3.4",
    lastActiveAt: new Date("2026-01-01T10:00:00Z").toISOString(),
    createdAt: new Date("2026-01-01T09:00:00Z").toISOString(),
    expiresAt: new Date("2027-01-01").toISOString(),
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRevokeSession).mockReturnValue({
    mutate: mockRevokeMutate,
    isPending: false,
  } as never);
});

describe("SessionList", () => {
  it("renders sessions with device name", () => {
    vi.mocked(useSessions).mockReturnValue({
      data: MOCK_SESSIONS,
      isLoading: false,
      error: null,
    } as never);

    render(<SessionList />);
    expect(screen.getByText("Chrome on macOS")).toBeInTheDocument();
  });

  it("shows loading skeletons when loading", () => {
    vi.mocked(useSessions).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as never);

    const { container } = render(<SessionList />);
    // Loading skeleton elements are present
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(2);
  });

  it("shows empty message when no sessions", () => {
    vi.mocked(useSessions).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as never);

    render(<SessionList />);
    expect(screen.getByText("noSessions")).toBeInTheDocument();
  });

  it("shows error message on fetch failure", () => {
    vi.mocked(useSessions).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Failed"),
    } as never);

    render(<SessionList />);
    expect(screen.getByText("loadError")).toBeInTheDocument();
  });

  it("calls revokeSession when revoke button clicked", async () => {
    vi.mocked(useSessions).mockReturnValue({
      data: MOCK_SESSIONS,
      isLoading: false,
      error: null,
    } as never);

    render(<SessionList />);
    fireEvent.click(screen.getByRole("button", { name: /revokeButton/i }));

    await waitFor(() => {
      expect(mockRevokeMutate).toHaveBeenCalledWith("sess-1");
    });
  });
});
