// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { aggregateReactions, useReactions } from "./use-reactions";
import type { ChatMessageReaction } from "@/features/chat/types";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const USER_A = "user-a";
const USER_B = "user-b";
const MSG_ID = "msg-1";
const CONV_ID = "conv-1";

const reactions: ChatMessageReaction[] = [
  { emoji: "👍", userId: USER_A, createdAt: "2026-01-01T00:00:00Z" },
  { emoji: "👍", userId: USER_B, createdAt: "2026-01-01T00:00:01Z" },
  { emoji: "❤️", userId: USER_A, createdAt: "2026-01-01T00:00:02Z" },
];

describe("aggregateReactions", () => {
  it("groups reactions by emoji with count", () => {
    const result = aggregateReactions(reactions, USER_A);
    const thumbs = result.find((r) => r.emoji === "👍");
    expect(thumbs?.count).toBe(2);
    expect(thumbs?.hasOwnReaction).toBe(true);

    const heart = result.find((r) => r.emoji === "❤️");
    expect(heart?.count).toBe(1);
    expect(heart?.hasOwnReaction).toBe(true);
  });

  it("sets hasOwnReaction=false when current user has not reacted", () => {
    const result = aggregateReactions(reactions, "unknown-user");
    expect(result.every((r) => !r.hasOwnReaction)).toBe(true);
  });

  it("returns empty array for no reactions", () => {
    expect(aggregateReactions([], USER_A)).toHaveLength(0);
  });
});

describe("useReactions", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("initializes with given reactions", () => {
    const { result } = renderHook(() =>
      useReactions({
        messageId: MSG_ID,
        conversationId: CONV_ID,
        initialReactions: reactions,
        currentUserId: USER_A,
      }),
    );
    expect(result.current.reactions).toHaveLength(3);
    expect(result.current.aggregated).toHaveLength(2); // 2 unique emojis
  });

  it("optimistically adds a new reaction", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(() =>
      useReactions({
        messageId: MSG_ID,
        conversationId: CONV_ID,
        initialReactions: [],
        currentUserId: USER_A,
      }),
    );

    await act(async () => {
      await result.current.toggleReaction("🔥");
    });

    expect(result.current.reactions).toHaveLength(1);
    expect(result.current.reactions[0]?.emoji).toBe("🔥");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/messages/${MSG_ID}/reactions`),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("optimistically removes own reaction on toggle", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    const existing: ChatMessageReaction[] = [
      { emoji: "👍", userId: USER_A, createdAt: "2026-01-01T00:00:00Z" },
    ];

    const { result } = renderHook(() =>
      useReactions({
        messageId: MSG_ID,
        conversationId: CONV_ID,
        initialReactions: existing,
        currentUserId: USER_A,
      }),
    );

    await act(async () => {
      await result.current.toggleReaction("👍");
    });

    expect(result.current.reactions).toHaveLength(0);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("rolls back on API error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));

    const { result } = renderHook(() =>
      useReactions({
        messageId: MSG_ID,
        conversationId: CONV_ID,
        initialReactions: [],
        currentUserId: USER_A,
      }),
    );

    await act(async () => {
      await result.current.toggleReaction("😂");
    });

    // After rollback, should be back to initial (empty)
    expect(result.current.reactions).toHaveLength(0);
  });

  it("applyReactionEvent adds reaction from socket", () => {
    const { result } = renderHook(() =>
      useReactions({
        messageId: MSG_ID,
        conversationId: CONV_ID,
        initialReactions: [],
        currentUserId: USER_A,
      }),
    );

    act(() => {
      result.current.applyReactionEvent({
        emoji: "🎉",
        userId: USER_B,
        action: "added",
      });
    });

    expect(result.current.reactions).toHaveLength(1);
    expect(result.current.reactions[0]?.emoji).toBe("🎉");
  });

  it("applyReactionEvent removes reaction from socket", () => {
    const initial: ChatMessageReaction[] = [
      { emoji: "🎉", userId: USER_B, createdAt: "2026-01-01T00:00:00Z" },
    ];

    const { result } = renderHook(() =>
      useReactions({
        messageId: MSG_ID,
        conversationId: CONV_ID,
        initialReactions: initial,
        currentUserId: USER_A,
      }),
    );

    act(() => {
      result.current.applyReactionEvent({
        emoji: "🎉",
        userId: USER_B,
        action: "removed",
      });
    });

    expect(result.current.reactions).toHaveLength(0);
  });

  it("applyReactionEvent deduplicates on re-add", () => {
    const initial: ChatMessageReaction[] = [
      { emoji: "👍", userId: USER_B, createdAt: "2026-01-01T00:00:00Z" },
    ];

    const { result } = renderHook(() =>
      useReactions({
        messageId: MSG_ID,
        conversationId: CONV_ID,
        initialReactions: initial,
        currentUserId: USER_A,
      }),
    );

    act(() => {
      result.current.applyReactionEvent({ emoji: "👍", userId: USER_B, action: "added" });
    });

    expect(result.current.reactions).toHaveLength(1); // no duplicate
  });
});
