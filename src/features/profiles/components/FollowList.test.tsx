// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@/test/test-utils";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRealTimersForReactQuery } from "@/test/vi-patterns";

vi.mock("./FollowButton", () => ({
  FollowButton: ({ targetUserId }: { targetUserId: string }) => (
    <button data-testid={`follow-btn-${targetUserId}`}>Follow</button>
  ),
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) => `${namespace}.${key}`,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("a", { href, "data-testid": "member-link", ...props }, children),
}));

vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement("div", { "data-testid": "avatar", ...props }, children),
  AvatarImage: (props: Record<string, unknown>) =>
    React.createElement("img", { "data-testid": "avatar-image", ...props }),
  AvatarFallback: ({ children }: React.PropsWithChildren) =>
    React.createElement("span", { "data-testid": "avatar-fallback" }, children),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

const VIEWER_ID = "00000000-0000-4000-8000-000000000001";
const TARGET_ID = "00000000-0000-4000-8000-000000000002";
const MEMBER_ID = "00000000-0000-4000-8000-000000000003";

const mockMember = {
  userId: MEMBER_ID,
  displayName: "Alice Obi",
  photoUrl: null,
  locationCity: "Lagos",
  locationCountry: "Nigeria",
  followedAt: "2026-01-01T00:00:00.000Z",
};

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Mock window.location.origin
  Object.defineProperty(window, "location", {
    value: { origin: "https://example.com" },
    writable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

import { FollowList } from "./FollowList";

describe("FollowList", () => {
  it("renders member names and locations from API response", async () => {
    useRealTimersForReactQuery();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { members: [mockMember], nextCursor: null } }),
    });

    render(<FollowList userId={TARGET_ID} type="followers" viewerUserId={VIEWER_ID} />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(screen.getByText("Alice Obi")).toBeInTheDocument());
    expect(screen.getByText("Lagos, Nigeria")).toBeInTheDocument();
  });

  it("shows noFollowers text when followers list is empty", async () => {
    useRealTimersForReactQuery();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { members: [], nextCursor: null } }),
    });

    render(<FollowList userId={TARGET_ID} type="followers" viewerUserId={VIEWER_ID} />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(screen.getByText("Profile.noFollowers")).toBeInTheDocument());
  });

  it("shows noFollowing text when following list is empty", async () => {
    useRealTimersForReactQuery();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { members: [], nextCursor: null } }),
    });

    render(<FollowList userId={TARGET_ID} type="following" viewerUserId={VIEWER_ID} />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(screen.getByText("Profile.noFollowing")).toBeInTheDocument());
  });

  it("does NOT render FollowButton for viewer's own entry", async () => {
    useRealTimersForReactQuery();
    const viewerMember = { ...mockMember, userId: VIEWER_ID };
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { members: [viewerMember], nextCursor: null } }),
    });

    render(<FollowList userId={TARGET_ID} type="followers" viewerUserId={VIEWER_ID} />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(screen.getByText("Alice Obi")).toBeInTheDocument());
    // FollowButton should NOT be rendered for viewer's own entry
    expect(screen.queryByTestId(`follow-btn-${VIEWER_ID}`)).not.toBeInTheDocument();
  });

  it("renders FollowButton for other members", async () => {
    useRealTimersForReactQuery();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { members: [mockMember], nextCursor: null } }),
    });

    render(<FollowList userId={TARGET_ID} type="followers" viewerUserId={VIEWER_ID} />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(screen.getByTestId(`follow-btn-${MEMBER_ID}`)).toBeInTheDocument());
  });

  it("Load more button appears when nextCursor is non-null", async () => {
    useRealTimersForReactQuery();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { members: [mockMember], nextCursor: "2026-01-01T00:00:00.000Z" },
      }),
    });

    render(<FollowList userId={TARGET_ID} type="followers" viewerUserId={VIEWER_ID} />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(screen.getByText("Profile.followListLoadMore")).toBeInTheDocument());
  });

  it("renders member names as links to profile pages", async () => {
    useRealTimersForReactQuery();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { members: [mockMember], nextCursor: null } }),
    });

    render(<FollowList userId={TARGET_ID} type="followers" viewerUserId={VIEWER_ID} />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(screen.getByText("Alice Obi")).toBeInTheDocument());
    const link = screen.getByTestId("member-link");
    expect(link).toHaveAttribute("href", `/profiles/${MEMBER_ID}`);
  });

  it("Load more button is absent when nextCursor is null", async () => {
    useRealTimersForReactQuery();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { members: [mockMember], nextCursor: null } }),
    });

    render(<FollowList userId={TARGET_ID} type="followers" viewerUserId={VIEWER_ID} />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(screen.getByText("Alice Obi")).toBeInTheDocument());
    expect(screen.queryByText("Profile.followListLoadMore")).not.toBeInTheDocument();
  });
});
