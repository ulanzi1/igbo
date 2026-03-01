// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CommentItem } from "./CommentItem";
import type { PostComment } from "@/db/queries/post-interactions";

vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string, params?: Record<string, unknown>) =>
    params ? `${ns}.${key}(${JSON.stringify(params)})` : `${ns}.${key}`,
}));
vi.mock("react", async () => ({
  ...(await vi.importActual("react")),
  useTransition: () => [
    false,
    (fn: () => void) => {
      void fn();
    },
  ],
}));

function makeComment(overrides: Partial<PostComment> = {}): PostComment {
  return {
    id: "comment-1",
    postId: "post-1",
    authorId: "user-1",
    authorDisplayName: "Ada Obi",
    authorPhotoUrl: null,
    content: "Hello world",
    parentCommentId: null,
    deletedAt: null,
    createdAt: "2026-03-01T00:00:00Z",
    replies: [],
    ...overrides,
  };
}

describe("CommentItem", () => {
  const onReply = vi.fn();
  const onDelete = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    onReply.mockClear();
    onDelete.mockClear();
  });

  it("renders author display name and content", () => {
    render(
      <CommentItem
        comment={makeComment()}
        currentUserId="user-2"
        onReply={onReply}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByText("Ada Obi")).toBeInTheDocument();
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("shows '[Comment deleted]' placeholder when deletedAt is set", () => {
    render(
      <CommentItem
        comment={makeComment({ deletedAt: "2026-03-01T00:00:00Z", content: "" })}
        currentUserId="user-2"
        onReply={onReply}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByText("Feed.comments.deleted")).toBeInTheDocument();
    expect(screen.queryByText("Hello world")).not.toBeInTheDocument();
  });

  it("shows Reply button for top-level comments (not replies)", () => {
    render(
      <CommentItem
        comment={makeComment()}
        currentUserId="user-2"
        onReply={onReply}
        onDelete={onDelete}
        isReply={false}
      />,
    );

    expect(screen.getByText("Feed.comments.reply")).toBeInTheDocument();
  });

  it("does NOT show Reply button when isReply=true", () => {
    render(
      <CommentItem
        comment={makeComment()}
        currentUserId="user-2"
        onReply={onReply}
        onDelete={onDelete}
        isReply
      />,
    );

    expect(screen.queryByText("Feed.comments.reply")).not.toBeInTheDocument();
  });

  it("shows Delete button only for own comments (authorId === currentUserId)", () => {
    const { rerender } = render(
      <CommentItem
        comment={makeComment({ authorId: "user-1" })}
        currentUserId="user-1"
        onReply={onReply}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByText("Feed.comments.delete")).toBeInTheDocument();

    rerender(
      <CommentItem
        comment={makeComment({ authorId: "user-1" })}
        currentUserId="user-2"
        onReply={onReply}
        onDelete={onDelete}
      />,
    );

    expect(screen.queryByText("Feed.comments.delete")).not.toBeInTheDocument();
  });

  it("calls onReply with comment ID and author name when Reply clicked", () => {
    render(
      <CommentItem
        comment={makeComment()}
        currentUserId="user-2"
        onReply={onReply}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByText("Feed.comments.reply"));
    expect(onReply).toHaveBeenCalledWith("comment-1", "Ada Obi");
  });

  it("calls onDelete with comment ID when Delete clicked", () => {
    render(
      <CommentItem
        comment={makeComment({ authorId: "user-1" })}
        currentUserId="user-1"
        onReply={onReply}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByText("Feed.comments.delete"));
    expect(onDelete).toHaveBeenCalledWith("comment-1");
  });

  it("renders reply comments when comment.replies is non-empty", () => {
    const reply: PostComment = makeComment({
      id: "reply-1",
      authorDisplayName: "Bob",
      content: "Reply content",
      parentCommentId: "comment-1",
    });
    render(
      <CommentItem
        comment={makeComment({ replies: [reply] })}
        currentUserId="user-2"
        onReply={onReply}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByText("Reply content")).toBeInTheDocument();
  });

  it("replies are indented (isReply=true adds ml-10)", () => {
    const reply: PostComment = makeComment({
      id: "reply-1",
      authorDisplayName: "Bob",
      content: "Reply content",
      parentCommentId: "comment-1",
    });
    render(
      <CommentItem
        comment={makeComment({ replies: [reply] })}
        currentUserId="user-2"
        onReply={onReply}
        onDelete={onDelete}
      />,
    );

    // The reply is rendered as a nested CommentItem with isReply=true → has ml-10
    const replyElements = document.querySelectorAll(".ml-10");
    expect(replyElements.length).toBeGreaterThan(0);
  });
});
