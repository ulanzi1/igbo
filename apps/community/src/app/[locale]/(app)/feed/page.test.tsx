// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/server/auth/config", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/features/feed", () => ({
  FeedList: ({
    canCreatePost,
    userName,
    currentUserId,
  }: {
    canCreatePost?: boolean;
    userName?: string;
    currentUserId?: string;
  }) => (
    <div
      data-testid="feed-list"
      data-can-create={String(canCreatePost)}
      data-user-name={userName}
      data-current-user-id={currentUserId}
    />
  ),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));
vi.mock("@/services/permissions", () => ({
  canCreateFeedPost: vi.fn(),
}));

import { auth } from "@/server/auth/config";
import { redirect } from "next/navigation";
import { canCreateFeedPost } from "@/services/permissions";
import FeedPage from "./page";

const mockAuth = vi.mocked(auth);
const mockRedirect = vi.mocked(redirect);
const mockCanCreateFeedPost = vi.mocked(canCreateFeedPost);

beforeEach(() => {
  vi.clearAllMocks();
  mockCanCreateFeedPost.mockResolvedValue({ allowed: true });
});

describe("FeedPage", () => {
  it("renders FeedList when session exists", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1", name: "Test" } } as Awaited<
      ReturnType<typeof auth>
    >);

    const Page = await FeedPage();
    render(Page as React.ReactElement);

    expect(screen.getByTestId("feed-list")).toBeInTheDocument();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("calls redirect('/') when session is null", async () => {
    mockAuth.mockResolvedValue(null);
    mockRedirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(FeedPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/");
  });

  it("page has export const dynamic = 'force-dynamic'", async () => {
    const mod = await import("./page");
    expect(mod.dynamic).toBe("force-dynamic");
  });

  it("passes canCreatePost={true} to FeedList when canCreateFeedPost returns { allowed: true }", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-1", name: "Test User", image: null },
    } as Awaited<ReturnType<typeof auth>>);
    mockCanCreateFeedPost.mockResolvedValue({ allowed: true });

    const Page = await FeedPage();
    render(Page as React.ReactElement);

    expect(screen.getByTestId("feed-list")).toHaveAttribute("data-can-create", "true");
  });

  it("passes canCreatePost={false} to FeedList when canCreateFeedPost returns { allowed: false }", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-1", name: "Test User", image: null },
    } as Awaited<ReturnType<typeof auth>>);
    mockCanCreateFeedPost.mockResolvedValue({
      allowed: false,
      reason: "Permissions.feedPostRequired",
      tierRequired: "PROFESSIONAL",
    });

    const Page = await FeedPage();
    render(Page as React.ReactElement);

    expect(screen.getByTestId("feed-list")).toHaveAttribute("data-can-create", "false");
  });

  it("passes userName from session.user.name to FeedList", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1", name: "Jane Doe", image: null } } as Awaited<
      ReturnType<typeof auth>
    >);

    const Page = await FeedPage();
    render(Page as React.ReactElement);

    expect(screen.getByTestId("feed-list")).toHaveAttribute("data-user-name", "Jane Doe");
  });

  it("passes currentUserId from session.user.id to FeedList", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-abc", name: "Test", image: null },
    } as Awaited<ReturnType<typeof auth>>);

    const Page = await FeedPage();
    render(Page as React.ReactElement);

    expect(screen.getByTestId("feed-list")).toHaveAttribute("data-current-user-id", "user-abc");
  });
});
