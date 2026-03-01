// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FeedList } from "./FeedList";

// ── Global jsdom stubs ────────────────────────────────────────────────────────
// jsdom does not implement IntersectionObserver — use a class stub so `new`
// works correctly (arrow functions cannot be used as constructors).
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();

global.IntersectionObserver = class {
  observe = mockObserve;
  disconnect = mockDisconnect;
  unobserve = vi.fn();
  takeRecords = vi.fn(() => []);
  readonly root: Element | null = null;
  readonly rootMargin = "";
  readonly thresholds: number[] = [];
  constructor(_cb: IntersectionObserverCallback, _opts?: IntersectionObserverInit) {}
} as unknown as typeof IntersectionObserver;

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("../hooks/use-feed");
vi.mock("./PostComposer", () => ({
  PostComposer: ({ canCreatePost }: { canCreatePost: boolean }) => (
    <div data-testid="post-composer" data-can-create={String(canCreatePost)} />
  ),
}));
vi.mock("./FeedItem", () => ({
  FeedItem: ({
    post,
    currentUserId,
  }: {
    post: { id: string; authorDisplayName: string };
    currentUserId?: string;
  }) => (
    <div data-testid={`feed-item-${post.id}`} data-current-user={currentUserId}>
      {post.authorDisplayName}
    </div>
  ),
}));
vi.mock("./FeedItemSkeleton", () => ({
  FeedItemSkeleton: () => <div data-testid="skeleton" />,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string, _params?: Record<string, unknown>) =>
    `${namespace}.${key}`,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    variant,
    size,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: string;
    size?: string;
    className?: string;
  }) => (
    <button onClick={onClick} data-variant={variant} data-size={size} className={className}>
      {children}
    </button>
  ),
}));

import { useFeed } from "../hooks/use-feed";
import type { FeedPage, FeedPost } from "@/features/feed/types";

const mockUseFeed = vi.mocked(useFeed);

function makePost(id: string): FeedPost {
  return {
    id,
    authorId: "user-b",
    authorDisplayName: `Author ${id}`,
    authorPhotoUrl: null,
    content: `Content ${id}`,
    contentType: "text",
    visibility: "members_only",
    groupId: null,
    isPinned: false,
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    category: "discussion",
    originalPostId: null,
    media: [],
    createdAt: "2026-03-01T10:00:00.000Z",
    updatedAt: "2026-03-01T10:00:00.000Z",
  };
}

function makeUseFeedResult(
  overrides: Partial<ReturnType<typeof useFeed>>,
): ReturnType<typeof useFeed> {
  return {
    data: undefined,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    isLoading: false,
    isError: false,
    error: null,
    status: "success",
    fetchStatus: "idle",
    isFetching: false,
    isRefetching: false,
    refetch: vi.fn(),
    isSuccess: true,
    isPending: false,
    isLoadingError: false,
    isRefetchError: false,
    dataUpdatedAt: 0,
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    isPaused: false,
    isStale: false,
    isPlaceholderData: false,
    ...overrides,
  } as unknown as ReturnType<typeof useFeed>;
}

function makeDataWithPosts(posts: FeedPost[], isColdStart = false): { pages: FeedPage[] } {
  return {
    pages: [{ posts, nextCursor: null, isColdStart }],
    pageParams: [null],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FeedList", () => {
  it("shows 3 FeedItemSkeleton elements when isLoading=true", () => {
    mockUseFeed.mockReturnValue(makeUseFeedResult({ isLoading: true }));
    render(<FeedList />);
    expect(screen.getAllByTestId("skeleton")).toHaveLength(3);
  });

  it("renders FeedItem for each post when data is loaded", () => {
    const posts = [makePost("1"), makePost("2")];
    mockUseFeed.mockReturnValue(makeUseFeedResult({ data: makeDataWithPosts(posts) }));
    render(<FeedList />);
    expect(screen.getByTestId("feed-item-1")).toBeInTheDocument();
    expect(screen.getByTestId("feed-item-2")).toBeInTheDocument();
  });

  it("shows cold-start heading and CTA when isColdStart=true and no posts", () => {
    mockUseFeed.mockReturnValue(makeUseFeedResult({ data: makeDataWithPosts([], true) }));
    render(<FeedList />);
    expect(screen.getByText("Feed.coldStartHeading")).toBeInTheDocument();
    expect(screen.getByText("Feed.coldStartCta")).toBeInTheDocument();
  });

  it("shows cold-start inline prompt when isColdStart=true but posts are present", () => {
    const posts = [makePost("1")];
    mockUseFeed.mockReturnValue(makeUseFeedResult({ data: makeDataWithPosts(posts, true) }));
    render(<FeedList />);
    // The inline prompt should appear (not the empty-state heading)
    expect(screen.queryByText("Feed.coldStartHeading")).not.toBeInTheDocument();
    expect(screen.getByText("Feed.coldStartCta")).toBeInTheDocument();
  });

  it("does NOT show cold-start UI when isColdStart=false", () => {
    const posts = [makePost("1")];
    mockUseFeed.mockReturnValue(makeUseFeedResult({ data: makeDataWithPosts(posts, false) }));
    render(<FeedList />);
    expect(screen.queryByText("Feed.coldStartHeading")).not.toBeInTheDocument();
    expect(screen.queryByText("Feed.coldStartPrompt")).not.toBeInTheDocument();
  });

  it("renders Announcements only badge when filter=announcements", () => {
    const posts = [makePost("1")];
    mockUseFeed.mockReturnValue(makeUseFeedResult({ data: makeDataWithPosts(posts) }));
    render(<FeedList initialFilter="announcements" />);
    expect(screen.getByText("Feed.announcementsOnlyBadge")).toBeInTheDocument();
  });

  it("'Show all posts' button sets filter back to all", () => {
    const posts = [makePost("1")];
    mockUseFeed.mockReturnValue(makeUseFeedResult({ data: makeDataWithPosts(posts) }));
    render(<FeedList initialFilter="announcements" />);
    const showAllBtn = screen.getByText("Feed.showAllPosts");
    fireEvent.click(showAllBtn);
    // After clicking, announcements badge disappears
    expect(screen.queryByText("Feed.announcementsOnlyBadge")).not.toBeInTheDocument();
  });

  it("sort buttons render with aria-pressed attribute", () => {
    mockUseFeed.mockReturnValue(makeUseFeedResult({ data: makeDataWithPosts([]) }));
    render(<FeedList />);
    const chronoBtn = screen.getByText("Feed.sortChronological");
    expect(chronoBtn).toHaveAttribute("aria-pressed");
  });

  it("'Load more' button appears when hasNextPage=true and !isFetchingNextPage", () => {
    const posts = [makePost("1")];
    mockUseFeed.mockReturnValue(
      makeUseFeedResult({
        data: makeDataWithPosts(posts),
        hasNextPage: true,
        isFetchingNextPage: false,
      }),
    );
    render(<FeedList />);
    expect(screen.getByText("Feed.loadMore")).toBeInTheDocument();
  });

  it("clicking sort toggle persists selection to sessionStorage", () => {
    const posts = [makePost("1")];
    mockUseFeed.mockReturnValue(makeUseFeedResult({ data: makeDataWithPosts(posts) }));
    render(<FeedList />);
    const algoBtn = screen.getByText("Feed.sortAlgorithmic");
    fireEvent.click(algoBtn);
    expect(sessionStorage.getItem("feed-sort")).toBe("algorithmic");
  });

  it("shows noPostsYet text when no posts and not cold-start", () => {
    mockUseFeed.mockReturnValue(makeUseFeedResult({ data: makeDataWithPosts([], false) }));
    render(<FeedList />);
    expect(screen.getByText("Feed.noPostsYet")).toBeInTheDocument();
  });

  it("renders PostComposer with canCreatePost=true when prop is true", () => {
    mockUseFeed.mockReturnValue(makeUseFeedResult({ data: makeDataWithPosts([]) }));
    render(<FeedList canCreatePost={true} userName="Jane" />);
    expect(screen.getByTestId("post-composer")).toHaveAttribute("data-can-create", "true");
  });

  it("renders PostComposer with canCreatePost=false when prop is false", () => {
    mockUseFeed.mockReturnValue(makeUseFeedResult({ data: makeDataWithPosts([]) }));
    render(<FeedList canCreatePost={false} userName="Jane" />);
    expect(screen.getByTestId("post-composer")).toHaveAttribute("data-can-create", "false");
  });

  it("passes currentUserId prop down to each FeedItem", () => {
    const posts = [makePost("1"), makePost("2")];
    mockUseFeed.mockReturnValue(makeUseFeedResult({ data: makeDataWithPosts(posts) }));
    render(<FeedList currentUserId="user-42" />);
    expect(screen.getByTestId("feed-item-1")).toHaveAttribute("data-current-user", "user-42");
    expect(screen.getByTestId("feed-item-2")).toHaveAttribute("data-current-user", "user-42");
  });
});
