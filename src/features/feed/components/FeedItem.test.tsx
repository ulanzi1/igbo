// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FeedItem } from "./FeedItem";
import type { FeedPost } from "@/features/feed/types";

vi.mock("./PostRichTextRenderer", () => ({
  PostRichTextRenderer: ({ content }: { content: string }) => (
    <div data-testid="rich-text-renderer">{content}</div>
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
    likeCount: 5,
    commentCount: 2,
    shareCount: 1,
    category: "discussion",
    media: [],
    createdAt: new Date(Date.now() - 3_600_000 * 2).toISOString(), // 2 hours ago
    updatedAt: new Date(Date.now() - 3_600_000 * 2).toISOString(),
    ...overrides,
  };
}

describe("FeedItem", () => {
  it("renders author display name", () => {
    render(<FeedItem post={makePost()} />);
    expect(screen.getAllByText("Jane Doe")).not.toHaveLength(0);
  });

  it("renders avatar initials for author", () => {
    render(<FeedItem post={makePost()} />);
    expect(screen.getByTestId("avatar-fallback")).toHaveTextContent("JD");
  });

  it("renders post content text", () => {
    render(<FeedItem post={makePost({ content: "Test content here" })} />);
    expect(screen.getByText("Test content here")).toBeInTheDocument();
  });

  it("renders pinned indicator when isPinned=true", () => {
    render(<FeedItem post={makePost({ isPinned: true })} />);
    expect(screen.getByText("Feed.pinnedLabel")).toBeInTheDocument();
  });

  it("does NOT render pinned indicator when isPinned=false", () => {
    render(<FeedItem post={makePost({ isPinned: false })} />);
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
    render(<FeedItem post={post} />);
    const img = screen.getByAltText("Alt text");
    expect(img).toBeInTheDocument();
    expect(img.tagName).toBe("IMG");
    expect(img).toHaveAttribute("src", "https://example.com/img.jpg");
  });

  it("does NOT render image grid when media is empty", () => {
    render(<FeedItem post={makePost({ media: [] })} />);
    // No media images — only avatar images should exist (not media grid images)
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
    render(<FeedItem post={post} />);
    const video = document.querySelector("video");
    expect(video).not.toBeNull();
    expect(video!.muted).toBe(true);
  });

  it("renders engagement counts", () => {
    render(<FeedItem post={makePost({ likeCount: 5, commentCount: 2, shareCount: 1 })} />);
    // t() mock returns "Feed.likeCount({"count":5})" etc.
    expect(screen.getByText(/likeCount/)).toBeInTheDocument();
    expect(screen.getByText(/commentCount/)).toBeInTheDocument();
    expect(screen.getByText(/shareCount/)).toBeInTheDocument();
  });

  it("author name and avatar link to /profiles/${authorId}", () => {
    render(<FeedItem post={makePost({ authorId: "abc-123" })} />);
    const links = document.querySelectorAll('a[href="/profiles/abc-123"]');
    expect(links.length).toBeGreaterThanOrEqual(1);
  });

  it("renders Badge for announcement content type", () => {
    render(<FeedItem post={makePost({ contentType: "announcement" })} />);
    const badges = screen.getAllByTestId("badge");
    const announceBadge = badges.find((b) => b.textContent === "Feed.announcementBadge");
    expect(announceBadge).toBeTruthy();
  });

  it("renders PostRichTextRenderer for rich_text contentType", () => {
    render(<FeedItem post={makePost({ contentType: "rich_text", content: '{"type":"doc"}' })} />);
    expect(screen.getByTestId("rich-text-renderer")).toBeInTheDocument();
  });

  it("renders plain text div for text contentType (not rich_text)", () => {
    render(<FeedItem post={makePost({ contentType: "text", content: "Plain text" })} />);
    expect(screen.queryByTestId("rich-text-renderer")).not.toBeInTheDocument();
    expect(screen.getByText("Plain text")).toBeInTheDocument();
  });

  it("shows 'Event' category badge for posts with category = 'event'", () => {
    render(<FeedItem post={makePost({ category: "event" })} />);
    const badges = screen.getAllByTestId("badge");
    const eventBadge = badges.find((b) => b.textContent === "Feed.composer.categoryEvent");
    expect(eventBadge).toBeTruthy();
  });

  it("does NOT show category badge for category = 'discussion'", () => {
    render(<FeedItem post={makePost({ category: "discussion" })} />);
    // discussion is the default — no badge shown
    const badges = screen.queryAllByTestId("badge");
    const discussionBadge = badges.find(
      (b) => b.textContent === "Feed.composer.categoryDiscussion",
    );
    expect(discussionBadge).toBeUndefined();
  });

  it("shows 'Announcement' category badge for posts with category = 'announcement'", () => {
    render(<FeedItem post={makePost({ category: "announcement" })} />);
    const badges = screen.getAllByTestId("badge");
    const annBadge = badges.find((b) => b.textContent === "Feed.composer.categoryAnnouncement");
    expect(annBadge).toBeTruthy();
  });
});
