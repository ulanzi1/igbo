// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test/test-utils";

const mockUseSession = vi.fn();
vi.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
}));

const mockUseQuery = vi.fn();
const mockInvalidateQueries = vi.fn();
const mockUseQueryClient = vi.fn(() => ({ invalidateQueries: mockInvalidateQueries }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useQueryClient: () => mockUseQueryClient(),
}));

vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string, params?: Record<string, unknown>) => {
    if (params && "name" in params) return `${ns}.${key}:${String(params["name"])}`;
    if (params && "count" in params) return `${ns}.${key}:${String(params["count"])}`;
    return `${ns}.${key}`;
  },
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

import { RecommendedGroupsWidget } from "./RecommendedGroupsWidget";

const GROUP_ID = "00000000-0000-4000-8000-000000000010";
const makeGroup = (overrides = {}) => ({
  id: GROUP_ID,
  name: "Igbo Heritage",
  description: "A group for Igbo culture",
  bannerUrl: null,
  visibility: "public" as const,
  joinType: "open" as const,
  memberCount: 10,
  score: 3,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSession.mockReturnValue({ data: null });
  mockUseQuery.mockReturnValue({ data: undefined, isLoading: false });
  global.fetch = vi.fn().mockResolvedValue({ ok: true });
});

describe("RecommendedGroupsWidget", () => {
  it("returns null when no session", () => {
    const { container } = render(<RecommendedGroupsWidget />);
    expect(container.firstChild).toBeNull();
  });

  it("renders skeleton rows while loading", () => {
    mockUseSession.mockReturnValue({ data: { user: { id: "u1" } } });
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true });
    render(<RecommendedGroupsWidget />);
    expect(screen.getAllByTestId("skeleton")).toHaveLength(3);
  });

  it("shows empty state when no groups returned", () => {
    mockUseSession.mockReturnValue({ data: { user: { id: "u1" } } });
    mockUseQuery.mockReturnValue({ data: { groups: [] }, isLoading: false });
    render(<RecommendedGroupsWidget />);
    expect(screen.getByText("Groups.recommendations.empty")).toBeInTheDocument();
  });

  it("renders group names with links", () => {
    mockUseSession.mockReturnValue({ data: { user: { id: "u1" } } });
    mockUseQuery.mockReturnValue({ data: { groups: [makeGroup()] }, isLoading: false });
    render(<RecommendedGroupsWidget />);
    const link = screen.getByText("Igbo Heritage").closest("a");
    expect(link).toHaveAttribute("href", `/groups/${GROUP_ID}`);
  });

  it("renders dismiss button and calls API on click", async () => {
    mockUseSession.mockReturnValue({ data: { user: { id: "u1" } } });
    mockUseQuery.mockReturnValue({ data: { groups: [makeGroup()] }, isLoading: false });
    render(<RecommendedGroupsWidget />);

    const dismissBtn = screen.getByRole("button", { name: /Igbo Heritage/i });
    fireEvent.click(dismissBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/v1/groups/recommendations/${GROUP_ID}/dismiss`,
        expect.objectContaining({ method: "POST", credentials: "include" }),
      );
    });
    await waitFor(() => {
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["recommended-groups"] });
    });
  });

  it("does not invalidate queries when dismiss API fails", async () => {
    mockUseSession.mockReturnValue({ data: { user: { id: "u1" } } });
    mockUseQuery.mockReturnValue({ data: { groups: [makeGroup()] }, isLoading: false });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 500 });
    render(<RecommendedGroupsWidget />);

    const dismissBtn = screen.getByRole("button", { name: /Igbo Heritage/i });
    fireEvent.click(dismissBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
    expect(mockInvalidateQueries).not.toHaveBeenCalled();
  });

  it("shows Request to Join badge for private groups", () => {
    mockUseSession.mockReturnValue({ data: { user: { id: "u1" } } });
    mockUseQuery.mockReturnValue({
      data: { groups: [makeGroup({ visibility: "private", joinType: "approval" })] },
      isLoading: false,
    });
    render(<RecommendedGroupsWidget />);
    expect(screen.getByText("Groups.requestToJoin")).toBeInTheDocument();
  });

  it("shows Join badge for public open groups", () => {
    mockUseSession.mockReturnValue({ data: { user: { id: "u1" } } });
    mockUseQuery.mockReturnValue({
      data: { groups: [makeGroup({ visibility: "public", joinType: "open" })] },
      isLoading: false,
    });
    render(<RecommendedGroupsWidget />);
    expect(screen.getByText("Groups.joinButton")).toBeInTheDocument();
  });
});
