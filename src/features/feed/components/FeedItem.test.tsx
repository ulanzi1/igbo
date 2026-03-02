// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FeedItem } from "./FeedItem";
import type { FeedPost } from "@/features/feed/types";

vi.mock("./PostRichTextRenderer", () => ({
  PostRichTextRenderer: ({ content }: { content: string }) => (
    <div data-testid="rich-text-renderer">{content}</div>
  ),
}));

vi.mock("./ReactionBar", () => ({
  ReactionBar: ({ postId, initialCount }: { postId: string; initialCount: number }) => (
    <div data-testid="reaction-bar" data-post-id={postId} data-count={initialCount} />
  ),
}));

vi.mock("./CommentSection", () => ({
  CommentSection: ({ postId }: { postId: string }) => (
    <div data-testid="comment-section" data-post-id={postId} />
  ),
}));

vi.mock("./ShareDialog", () => ({
  ShareDialog: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="share-dialog" /> : null,
}));

vi.mock("./BookmarkButton", () => ({
  BookmarkButton: ({
    postId,
    initialIsBookmarked,
  }: {
    postId: string;
    initialIsBookmarked: boolean;
  }) => (
    <button
      data-testid="bookmark-button"
      data-post-id={postId}
      data-is-bookmarked={String(initialIsBookmarked)}
    />
  ),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${namespace}.${key}(${JSON.stringify(params)})`;
    return `${namespace}.${key}`;
  },
}));

vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  AvatarImage: ({ src, alt }: { src?: string; alt?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} data-testid="avatar-image" />
  ),
  AvatarFallback: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="avatar-fallback">{children}</span>
  ),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, variant }: { children: React.ReactNode; variant?: string }) => (
    <span data-testid="badge" data-variant={variant}>
      {children}
    </span>
  ),
}));

function makePost(overrides: Partial<FeedPost> = {}): FeedPost {
  return {
    id: "post-1",
    authorId: "user-b",
    authorDisplayName: "Jane Doe",
    authorPhotoUrl: null,
    content: "Hello world",
    contentType: "text",
    visibility: "members_only",
    groupId: null,
    isPinned: false,
    pinnedAt: null,
    likeCount: 5,
    commentCount: 2,
    shareCount: 1,
    category: "discussion",
    originalPostId: null,
    media: [],
    isBookmarked: false,
    createdAt: new Date(Date.now() - 3_600_000 * 2).toISOString(), // 2 hours ago
    updatedAt: new Date(Date.now() - 3_600_000 * 2).toISOString(),
    ...overrides,
  };
}

function renderPost(overrides: Partial<FeedPost> = {}, role = "MEMBER") {
  return render(
    <FeedItem
      post={makePost(overrides)}
      currentUserId="user-1"
      currentUserRole={role}
      sort="chronological"
      filter="all"
    />,
  );
}

describe("FeedItem", () => {
  it("renders author display name", () => {
    renderPost();
    expect(screen.getAllByText("Jane Doe")).not.toHaveLength(0);
  });

  it("renders avatar initials for author", () => {
    renderPost();
    expect(screen.getByTestId("avatar-fallback")).toHaveTextContent("JD");
  });

  it("renders post content text", () => {
    renderPost({ content: "Test content here" });
    expect(screen.getByText("Test content here")).toBeInTheDocument();
  });

  it("renders pinned indicator when isPinned=true", () => {
    renderPost({ isPinned: true });
    expect(screen.getByText("Feed.pinnedLabel")).toBeInTheDocument();
  });

  it("does NOT render pinned indicator when isPinned=false", () => {
    renderPost({ isPinned: false });
    expect(screen.queryByText("Feed.pinnedLabel")).not.toBeInTheDocument();
  });

  it("renders image element for media posts with image type", () => {
    const post = makePost({
      media: [
        {
          id: "m1",
          mediaUrl: "https://example.com/img.jpg",
          mediaType: "image",
          altText: "Alt text",
          sortOrder: 0,
        },
      ],
    });
    render(
      <FeedItem
        post={post}
        currentUserId="user-1"
        currentUserRole="MEMBER"
        sort="chronological"
        filter="all"
      />,
    );
    const img = screen.getByAltText("Alt text");
    expect(img).toBeInTheDocument();
    expect(img.tagName).toBe("IMG");
    expect(img).toHaveAttribute("src", "https://example.com/img.jpg");
  });

  it("does NOT render image grid when media is empty", () => {
    renderPost({ media: [] });
    const images = screen.queryAllByRole("img");
    const mediaSrcs = images.filter((img) => img.getAttribute("src")?.includes("example.com"));
    expect(mediaSrcs).toHaveLength(0);
  });

  it("renders video element with muted attribute for video posts", () => {
    const post = makePost({
      media: [
        {
          id: "m1",
          mediaUrl: "https://example.com/video.mp4",
          mediaType: "video",
          altText: null,
          sortOrder: 0,
        },
      ],
    });
    render(
      <FeedItem
        post={post}
        currentUserId="user-1"
        currentUserRole="MEMBER"
        sort="chronological"
        filter="all"
      />,
    );
    const video = document.querySelector("video");
    expect(video).not.toBeNull();
    expect(video!.muted).toBe(true);
  });

  it("renders ReactionBar with postId and likeCount", () => {
    renderPost({ likeCount: 7 });
    const bar = screen.getByTestId("reaction-bar");
    expect(bar).toBeInTheDocument();
    expect(bar).toHaveAttribute("data-post-id", "post-1");
    expect(bar).toHaveAttribute("data-count", "7");
  });

  it("renders Comment button with comment count", () => {
    renderPost({ commentCount: 3 });
    // Button contains the comment count
    expect(screen.getByText(/Feed.comments.comment.*3/)).toBeInTheDocument();
  });

  it("clicking Comment button shows CommentSection", () => {
    renderPost();
    expect(screen.queryByTestId("comment-section")).not.toBeInTheDocument();

    const commentBtn = screen.getByText(/Feed.comments.comment/);
    fireEvent.click(commentBtn.closest("button")!);

    expect(screen.getByTestId("comment-section")).toBeInTheDocument();
  });

  it("clicking Comment button again hides CommentSection", () => {
    renderPost();
    const commentBtn = screen.getByText(/Feed.comments.comment/).closest("button")!;

    fireEvent.click(commentBtn);
    expect(screen.getByTestId("comment-section")).toBeInTheDocument();

    fireEvent.click(commentBtn);
    expect(screen.queryByTestId("comment-section")).not.toBeInTheDocument();
  });

  it("renders Share button with share count", () => {
    renderPost({ shareCount: 4 });
    expect(screen.getByText(/Feed.share.share.*4/)).toBeInTheDocument();
  });

  it("clicking Share button opens ShareDialog", () => {
    renderPost();
    expect(screen.queryByTestId("share-dialog")).not.toBeInTheDocument();

    const shareBtn = screen.getByText(/Feed.share.share/).closest("button")!;
    fireEvent.click(shareBtn);

    expect(screen.getByTestId("share-dialog")).toBeInTheDocument();
  });

  it("renders repost banner when originalPostId is set", () => {
    renderPost({ originalPostId: "some-original-id" });
    expect(screen.getByText("Feed.share.repostLabel")).toBeInTheDocument();
  });

  it("does NOT render repost banner when originalPostId is null", () => {
    renderPost({ originalPostId: null });
    expect(screen.queryByText("Feed.share.repostLabel")).not.toBeInTheDocument();
  });

  it("author name and avatar link to /profiles/${authorId}", () => {
    renderPost({ authorId: "abc-123" });
    const links = document.querySelectorAll('a[href="/profiles/abc-123"]');
    expect(links.length).toBeGreaterThanOrEqual(1);
  });

  it("renders Badge for announcement content type", () => {
    renderPost({ contentType: "announcement" });
    const badges = screen.getAllByTestId("badge");
    const announceBadge = badges.find((b) => b.textContent === "Feed.announcementBadge");
    expect(announceBadge).toBeTruthy();
  });

  it("renders PostRichTextRenderer for rich_text contentType", () => {
    renderPost({ contentType: "rich_text", content: '{"type":"doc"}' });
    expect(screen.getByTestId("rich-text-renderer")).toBeInTheDocument();
  });

  it("renders plain text div for text contentType (not rich_text)", () => {
    renderPost({ contentType: "text", content: "Plain text" });
    expect(screen.queryByTestId("rich-text-renderer")).not.toBeInTheDocument();
    expect(screen.getByText("Plain text")).toBeInTheDocument();
  });

  it("shows 'Event' category badge for posts with category = 'event'", () => {
    renderPost({ category: "event" });
    const badges = screen.getAllByTestId("badge");
    const eventBadge = badges.find((b) => b.textContent === "Feed.composer.categoryEvent");
    expect(eventBadge).toBeTruthy();
  });

  it("does NOT show category badge for category = 'discussion'", () => {
    renderPost({ category: "discussion" });
    const badges = screen.queryAllByTestId("badge");
    const discussionBadge = badges.find(
      (b) => b.textContent === "Feed.composer.categoryDiscussion",
    );
    expect(discussionBadge).toBeUndefined();
  });

  it("shows 'Announcement' category badge for posts with category = 'announcement'", () => {
    renderPost({ category: "announcement" });
    const badges = screen.getAllByTestId("badge");
    const annBadge = badges.find((b) => b.textContent === "Feed.composer.categoryAnnouncement");
    expect(annBadge).toBeTruthy();
  });

  it("renders BookmarkButton with initialIsBookmarked from post", () => {
    renderPost({ isBookmarked: true });
    const btn = screen.getByTestId("bookmark-button");
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("data-is-bookmarked", "true");
    expect(btn).toHaveAttribute("data-post-id", "post-1");
  });

  it("renders BookmarkButton with initialIsBookmarked=false when post.isBookmarked is false", () => {
    renderPost({ isBookmarked: false });
    const btn = screen.getByTestId("bookmark-button");
    expect(btn).toHaveAttribute("data-is-bookmarked", "false");
  });

  it("admin sees pin button when currentUserRole='ADMIN'", () => {
    renderPost({}, "ADMIN");
    // Admin pin button should render with aria-label for pinning
    const pinBtn = screen.getByRole("button", { name: /Feed.admin.pinAriaLabel/i });
    expect(pinBtn).toBeInTheDocument();
  });

  it("non-admin does NOT see pin button when currentUserRole='MEMBER'", () => {
    renderPost({}, "MEMBER");
    const pinBtn = screen.queryByRole("button", { name: /Feed.admin.pinAriaLabel/i });
    expect(pinBtn).not.toBeInTheDocument();
  });

  it("admin sees unpin button when post is already pinned", () => {
    renderPost({ isPinned: true }, "ADMIN");
    const unpinBtn = screen.getByRole("button", { name: /Feed.admin.unpinAriaLabel/i });
    expect(unpinBtn).toBeInTheDocument();
  });
});
