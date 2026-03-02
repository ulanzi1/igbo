// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BookmarkButton } from "./BookmarkButton";

vi.mock("../actions/toggle-bookmark", () => ({
  toggleBookmarkAction: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string) => `${ns}.${key}`,
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

vi.mock("lucide-react", () => ({
  Bookmark: () => <span data-testid="icon-bookmark" />,
  BookmarkCheck: () => <span data-testid="icon-bookmark-check" />,
}));

import { toggleBookmarkAction } from "../actions/toggle-bookmark";

const mockToggleBookmarkAction = vi.mocked(toggleBookmarkAction);

const POST_ID = "550e8400-e29b-41d4-a716-446655440000";

beforeEach(() => {
  mockToggleBookmarkAction.mockReset();
});

describe("BookmarkButton", () => {
  it("renders outline icon (Bookmark) when initialIsBookmarked=false", () => {
    render(<BookmarkButton postId={POST_ID} initialIsBookmarked={false} />);
    expect(screen.getByTestId("icon-bookmark")).toBeInTheDocument();
    expect(screen.queryByTestId("icon-bookmark-check")).not.toBeInTheDocument();
  });

  it("renders filled icon (BookmarkCheck) when initialIsBookmarked=true", () => {
    render(<BookmarkButton postId={POST_ID} initialIsBookmarked={true} />);
    expect(screen.getByTestId("icon-bookmark-check")).toBeInTheDocument();
    expect(screen.queryByTestId("icon-bookmark")).not.toBeInTheDocument();
  });

  it("clicking toggles optimistically to filled state from outline", async () => {
    mockToggleBookmarkAction.mockResolvedValue({ bookmarked: true });

    render(<BookmarkButton postId={POST_ID} initialIsBookmarked={false} />);
    const btn = screen.getByRole("button", {
      name: /Feed.bookmarks.bookmarkAriaLabel/i,
    });

    fireEvent.click(btn);

    // After optimistic update, icon should be bookmark-check
    expect(screen.getByTestId("icon-bookmark-check")).toBeInTheDocument();
  });

  it("clicking filled toggles optimistically to outline state", async () => {
    mockToggleBookmarkAction.mockResolvedValue({ bookmarked: false });

    render(<BookmarkButton postId={POST_ID} initialIsBookmarked={true} />);
    const btn = screen.getByRole("button", {
      name: /Feed.bookmarks.bookmarkedAriaLabel/i,
    });

    fireEvent.click(btn);

    // After optimistic update, icon should be outline bookmark
    expect(screen.getByTestId("icon-bookmark")).toBeInTheDocument();
  });

  it("rolls back when server action returns errorCode", async () => {
    mockToggleBookmarkAction.mockResolvedValue({
      success: false,
      errorCode: "VALIDATION_ERROR",
      reason: "Rate limit exceeded",
    });

    render(<BookmarkButton postId={POST_ID} initialIsBookmarked={false} />);
    const btn = screen.getByRole("button", {
      name: /Feed.bookmarks.bookmarkAriaLabel/i,
    });

    fireEvent.click(btn);

    // After async rollback resolves, should revert to outline
    await waitFor(() => {
      expect(screen.getByTestId("icon-bookmark")).toBeInTheDocument();
    });
  });

  it("syncs with server bookmarked: true after action", async () => {
    mockToggleBookmarkAction.mockResolvedValue({ bookmarked: true });

    render(<BookmarkButton postId={POST_ID} initialIsBookmarked={false} />);
    fireEvent.click(screen.getByRole("button"));

    // Should stay bookmarked after server confirms
    expect(screen.getByTestId("icon-bookmark-check")).toBeInTheDocument();
  });

  it("button has correct aria-pressed=false when not bookmarked", () => {
    render(<BookmarkButton postId={POST_ID} initialIsBookmarked={false} />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-pressed", "false");
  });

  it("button has correct aria-pressed=true when bookmarked", () => {
    render(<BookmarkButton postId={POST_ID} initialIsBookmarked={true} />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-pressed", "true");
  });

  it("button has correct aria-label for outline state (not bookmarked)", () => {
    render(<BookmarkButton postId={POST_ID} initialIsBookmarked={false} />);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-label")).toContain("Feed.bookmarks.bookmarkAriaLabel");
  });

  it("button has correct aria-label for filled state (bookmarked)", () => {
    render(<BookmarkButton postId={POST_ID} initialIsBookmarked={true} />);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-label")).toContain("Feed.bookmarks.bookmarkedAriaLabel");
  });
});
