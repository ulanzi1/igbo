// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ReactionBar } from "./ReactionBar";

vi.mock("../actions/react-to-post", () => ({
  reactToPostAction: vi.fn(),
}));
vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string, params?: Record<string, unknown>) =>
    params ? `${ns}.${key}(${JSON.stringify(params)})` : `${ns}.${key}`,
}));

import { reactToPostAction } from "../actions/react-to-post";

const mockReactToPostAction = vi.mocked(reactToPostAction);

const POST_ID = "550e8400-e29b-41d4-a716-446655440000";

beforeEach(() => {
  mockReactToPostAction.mockReset();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ data: { userReaction: null } }),
  });
});

function renderBar(initialCount = 0) {
  return render(<ReactionBar postId={POST_ID} initialCount={initialCount} />);
}

describe("ReactionBar", () => {
  it("renders reaction trigger button with count from initialCount", () => {
    renderBar(5);
    const btn = screen.getByRole("button", { name: /Feed.reactions.reactAriaLabel/i });
    expect(btn).toBeInTheDocument();
    // Shows count when > 0
    expect(btn.textContent).toContain("Feed.reactions.reactionCount");
  });

  it("shows 'React' text when count is 0 and no user reaction", () => {
    renderBar(0);
    const btn = screen.getByRole("button", { name: /Feed.reactions.reactAriaLabel/i });
    expect(btn.textContent).toContain("Feed.reactions.react");
  });

  it("clicking trigger opens reaction picker with 5 emoji buttons", async () => {
    renderBar(0);
    const triggerBtn = screen.getByRole("button", { name: /Feed.reactions.reactAriaLabel/i });
    fireEvent.click(triggerBtn);

    await waitFor(() => {
      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeInTheDocument();
    });

    // 5 reaction type buttons inside picker
    const picker = screen.getByRole("dialog");
    const emojiButtons = picker.querySelectorAll("button");
    expect(emojiButtons).toHaveLength(5);
  });

  it("clicking same reaction type optimistically decrements count and closes picker", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { userReaction: "like" } }),
    });
    mockReactToPostAction.mockResolvedValue({ newReactionType: null, countDelta: -1 });

    renderBar(3);
    const triggerBtn = screen.getByRole("button", { name: /Feed.reactions.reactAriaLabel/i });
    fireEvent.click(triggerBtn);

    await waitFor(() => screen.getByRole("dialog"));

    const likeBtn = screen.getByRole("button", { name: /Feed.reactions.like/i });
    fireEvent.click(likeBtn);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("clicking new reaction type optimistically increments count", async () => {
    mockReactToPostAction.mockResolvedValue({ newReactionType: "love", countDelta: 1 });

    renderBar(2);
    const triggerBtn = screen.getByRole("button", { name: /Feed.reactions.reactAriaLabel/i });
    fireEvent.click(triggerBtn);

    await waitFor(() => screen.getByRole("dialog"));

    const loveBtn = screen.getByRole("button", { name: /Feed.reactions.love/i });
    fireEvent.click(loveBtn);

    await waitFor(() => {
      expect(mockReactToPostAction).toHaveBeenCalledWith({
        postId: POST_ID,
        reactionType: "love",
      });
    });
  });

  it("rolls back optimistic update when server action returns errorCode", async () => {
    mockReactToPostAction.mockResolvedValue({
      success: false,
      errorCode: "VALIDATION_ERROR",
      reason: "Unauthorized",
    });

    renderBar(5);
    const triggerBtn = screen.getByRole("button", { name: /Feed.reactions.reactAriaLabel/i });
    fireEvent.click(triggerBtn);

    await waitFor(() => screen.getByRole("dialog"));

    const likeBtn = screen.getByRole("button", { name: /Feed.reactions.like/i });
    fireEvent.click(likeBtn);

    await waitFor(() => {
      expect(mockReactToPostAction).toHaveBeenCalled();
    });
    // Count should roll back — still shows 5 reactions (not 6)
    expect(triggerBtn.textContent).toContain("5");
  });

  it("reactToPostAction called with correct postId and reactionType", async () => {
    mockReactToPostAction.mockResolvedValue({ newReactionType: "like", countDelta: 1 });

    renderBar(0);
    const triggerBtn = screen.getByRole("button", { name: /Feed.reactions.reactAriaLabel/i });
    fireEvent.click(triggerBtn);

    await waitFor(() => screen.getByRole("dialog"));

    const likeBtn = screen.getByRole("button", { name: /Feed.reactions.like/i });
    fireEvent.click(likeBtn);

    await waitFor(() => {
      expect(mockReactToPostAction).toHaveBeenCalledWith({
        postId: POST_ID,
        reactionType: "like",
      });
    });
  });

  it("picker has correct aria-label and role='dialog'", async () => {
    renderBar(0);
    const triggerBtn = screen.getByRole("button", { name: /Feed.reactions.reactAriaLabel/i });
    fireEvent.click(triggerBtn);

    await waitFor(() => {
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("aria-label", "Feed.reactions.pickerLabel");
    });
  });

  it("closes picker on Escape key", async () => {
    renderBar(0);
    const triggerBtn = screen.getByRole("button", { name: /Feed.reactions.reactAriaLabel/i });
    fireEvent.click(triggerBtn);

    await waitFor(() => screen.getByRole("dialog"));

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("closes picker on outside click", async () => {
    renderBar(0);
    const triggerBtn = screen.getByRole("button", { name: /Feed.reactions.reactAriaLabel/i });
    fireEvent.click(triggerBtn);

    await waitFor(() => screen.getByRole("dialog"));

    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("trigger has aria-expanded reflecting picker open state", async () => {
    renderBar(0);
    const triggerBtn = screen.getByRole("button", { name: /Feed.reactions.reactAriaLabel/i });

    expect(triggerBtn).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(triggerBtn);

    await waitFor(() => {
      expect(triggerBtn).toHaveAttribute("aria-expanded", "true");
    });
  });
});
