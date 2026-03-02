// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SavedPostsList } from "./SavedPostsList";
import type { BookmarkedPost } from "@/services/bookmark-service";

vi.mock("./FeedItem", () => ({
  FeedItem: ({ post }: { post: { id: string } }) => <div data-testid={`feed-item-${post.id}`} />,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

function makeBookmarkedPost(id: string): BookmarkedPost {
  return {
    id,
    authorId: "user-1",
    authorDisplayName: "Author",
    authorPhotoUrl: null,
    content: `Content ${id}`,
    contentType: "text",
    visibility: "members_only",
    groupId: null,
    isPinned: false,
    pinnedAt: null,
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    category: "discussion",
    originalPostId: null,
    originalPost: null,
    media: [],
    isBookmarked: true,
    createdAt: "2026-03-01T10:00:00.000Z",
    updatedAt: "2026-03-01T10:00:00.000Z",
    bookmarkedAt: "2026-03-01T10:00:00.000Z",
  };
}

const defaultProps = {
  currentUserId: "user-1",
  currentUserRole: "MEMBER",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SavedPostsList", () => {
  it("renders empty state when initialPosts=[]", () => {
    render(<SavedPostsList {...defaultProps} initialPosts={[]} initialNextCursor={null} />);
    expect(screen.getByText("bookmarks.savedPageEmpty")).toBeInTheDocument();
    expect(screen.getByText("bookmarks.savedPageEmptyHint")).toBeInTheDocument();
  });

  it("renders FeedItem for each initial post", () => {
    const posts = [makeBookmarkedPost("1"), makeBookmarkedPost("2")];
    render(<SavedPostsList {...defaultProps} initialPosts={posts} initialNextCursor={null} />);
    expect(screen.getByTestId("feed-item-1")).toBeInTheDocument();
    expect(screen.getByTestId("feed-item-2")).toBeInTheDocument();
  });

  it("shows 'Load more' button when initialNextCursor is set", () => {
    const posts = [makeBookmarkedPost("1")];
    render(
      <SavedPostsList
        {...defaultProps}
        initialPosts={posts}
        initialNextCursor="2026-03-01T09:00:00.000Z"
      />,
    );
    expect(screen.getByRole("button", { name: /bookmarks.loadMore/i })).toBeInTheDocument();
  });

  it("does NOT show 'Load more' when initialNextCursor=null", () => {
    const posts = [makeBookmarkedPost("1")];
    render(<SavedPostsList {...defaultProps} initialPosts={posts} initialNextCursor={null} />);
    expect(screen.queryByRole("button", { name: /bookmarks.loadMore/i })).not.toBeInTheDocument();
  });

  it("clicking 'Load more' fetches next page", async () => {
    const cursor = "2026-03-01T09:00:00.000Z";
    const posts = [makeBookmarkedPost("1")];
    const nextPost = makeBookmarkedPost("2");

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { posts: [nextPost], nextCursor: null },
      }),
    } as Response);

    render(<SavedPostsList {...defaultProps} initialPosts={posts} initialNextCursor={cursor} />);

    const loadMoreBtn = screen.getByRole("button", { name: /bookmarks.loadMore/i });
    fireEvent.click(loadMoreBtn);

    await waitFor(() => {
      expect(screen.getByTestId("feed-item-2")).toBeInTheDocument();
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/user/bookmarks?cursor="),
    );
  });
});
