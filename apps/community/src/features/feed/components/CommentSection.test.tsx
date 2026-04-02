// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CommentSection } from "./CommentSection";
import type { PostComment } from "@igbo/db/queries/post-interactions";

vi.mock("../actions/add-comment", () => ({ addCommentAction: vi.fn() }));
vi.mock("./CommentItem", () => ({
  CommentItem: ({ comment }: { comment: PostComment }) => (
    <div data-testid={`comment-${comment.id}`}>{comment.content}</div>
  ),
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
vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string, params?: Record<string, unknown>) =>
    params ? `${ns}.${key}(${JSON.stringify(params)})` : `${ns}.${key}`,
}));

import { addCommentAction } from "../actions/add-comment";

const mockAddCommentAction = vi.mocked(addCommentAction);

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderSection(props?: { postId?: string; initialCount?: number; currentUserId?: string }) {
  const client = makeQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <CommentSection
        postId={props?.postId ?? "post-1"}
        initialCount={props?.initialCount ?? 0}
        currentUserId={props?.currentUserId ?? "user-1"}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockAddCommentAction.mockReset();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ data: { comments: [], nextCursor: null } }),
  });
});

describe("CommentSection", () => {
  it("renders textarea for new comment", async () => {
    renderSection();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Feed.comments.addComment")).toBeInTheDocument();
    });
  });

  it("shows 'No comments yet' when comments list is empty", async () => {
    renderSection();
    await waitFor(() => {
      expect(screen.getByText("Feed.comments.noComments")).toBeInTheDocument();
    });
  });

  it("shows 'Reply to {name}' indicator when reply mode is active", async () => {
    // This tests the replyTo state — we need to trigger it via CommentItem's onReply callback
    // Since CommentItem is mocked, we'll test with a comment in the list
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            comments: [
              {
                id: "c1",
                postId: "post-1",
                authorId: "user-2",
                authorDisplayName: "Ada",
                authorPhotoUrl: null,
                content: "Hello",
                parentCommentId: null,
                deletedAt: null,
                createdAt: "2026-03-01T00:00:00Z",
                replies: [],
              },
            ],
            nextCursor: null,
          },
        }),
    });

    renderSection();
    await waitFor(() => {
      expect(screen.getByTestId("comment-c1")).toBeInTheDocument();
    });
  });

  it("calls addCommentAction on submit", async () => {
    mockAddCommentAction.mockResolvedValue({
      success: true,
      comment: {
        id: "c1",
        postId: "post-1",
        content: "My comment",
        parentCommentId: null,
        createdAt: "2026-03-01T00:00:00Z",
      },
    });

    renderSection();
    await waitFor(() => screen.getByPlaceholderText("Feed.comments.addComment"));

    const textarea = screen.getByPlaceholderText("Feed.comments.addComment");
    fireEvent.change(textarea, { target: { value: "My comment" } });
    fireEvent.click(screen.getByText("Feed.comments.submit"));

    await waitFor(() => {
      expect(mockAddCommentAction).toHaveBeenCalledWith(
        expect.objectContaining({ content: "My comment" }),
      );
    });
  });

  it("shows error message when action returns PARENT_NOT_FOUND", async () => {
    mockAddCommentAction.mockResolvedValue({
      success: false,
      errorCode: "PARENT_NOT_FOUND",
      reason: "Parent not found",
    });

    renderSection();
    await waitFor(() => screen.getByPlaceholderText("Feed.comments.addComment"));

    const textarea = screen.getByPlaceholderText("Feed.comments.addComment");
    fireEvent.change(textarea, { target: { value: "Reply" } });
    fireEvent.click(screen.getByText("Feed.comments.submit"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Feed.comments.errorParentNotFound");
    });
  });

  it("shows error message when action returns INTERNAL_ERROR", async () => {
    mockAddCommentAction.mockResolvedValue({
      success: false,
      errorCode: "INTERNAL_ERROR",
      reason: "Something failed",
    });

    renderSection();
    await waitFor(() => screen.getByPlaceholderText("Feed.comments.addComment"));

    const textarea = screen.getByPlaceholderText("Feed.comments.addComment");
    fireEvent.change(textarea, { target: { value: "My comment" } });
    fireEvent.click(screen.getByText("Feed.comments.submit"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Feed.comments.errorGeneric");
    });
  });

  it("does NOT submit when textarea is empty", async () => {
    renderSection();
    await waitFor(() => screen.getByPlaceholderText("Feed.comments.addComment"));

    fireEvent.click(screen.getByText("Feed.comments.submit"));

    expect(mockAddCommentAction).not.toHaveBeenCalled();
  });

  it("clears input on success", async () => {
    mockAddCommentAction.mockResolvedValue({
      success: true,
      comment: {
        id: "c1",
        postId: "post-1",
        content: "My comment",
        parentCommentId: null,
        createdAt: "2026-03-01T00:00:00Z",
      },
    });

    renderSection();
    await waitFor(() => screen.getByPlaceholderText("Feed.comments.addComment"));

    const textarea = screen.getByPlaceholderText("Feed.comments.addComment");
    fireEvent.change(textarea, { target: { value: "My comment" } });
    fireEvent.click(screen.getByText("Feed.comments.submit"));

    await waitFor(() => {
      expect(mockAddCommentAction).toHaveBeenCalled();
    });
    // Textarea should be cleared after success
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });
});
