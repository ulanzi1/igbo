"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { reactToPostAction } from "../actions/react-to-post";
import type { PostReactionType } from "@/db/schema/post-interactions";

const REACTION_EMOJIS: Record<PostReactionType, string> = {
  like: "👍",
  love: "❤️",
  celebrate: "🎉",
  insightful: "💡",
  funny: "😄",
};

const REACTION_TYPES: PostReactionType[] = ["like", "love", "celebrate", "insightful", "funny"];

interface ReactionBarProps {
  postId: string;
  initialCount: number; // from post.likeCount
}

export function ReactionBar({ postId, initialCount }: ReactionBarProps) {
  const t = useTranslations("Feed");
  const [count, setCount] = useState(initialCount);
  const [userReaction, setUserReaction] = useState<PostReactionType | null>(null);
  const [isFetchedReaction, setIsFetchedReaction] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Dismiss picker on outside click or Escape key
  useEffect(() => {
    if (!isPickerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsPickerOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsPickerOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPickerOpen]);

  // Fetch viewer's current reaction lazily (on first picker open)
  const fetchReaction = useCallback(async () => {
    if (isFetchedReaction) return;
    setIsFetchedReaction(true);
    try {
      const res = await fetch(`/api/v1/posts/${postId}/reactions/me`);
      if (res.ok) {
        const json = (await res.json()) as { data: { userReaction: PostReactionType | null } };
        setUserReaction(json.data.userReaction);
      }
    } catch {
      // Ignore — viewer reaction unknown, no impact on UX
    }
  }, [postId, isFetchedReaction]);

  const handleTogglePicker = async () => {
    if (!isPickerOpen) {
      await fetchReaction();
    }
    setIsPickerOpen((prev) => !prev);
  };

  const handleReact = async (type: PostReactionType) => {
    if (isPending) return;
    setIsPending(true);
    setIsPickerOpen(false);

    // Optimistic update
    const prevReaction = userReaction;
    const prevCount = count;
    if (prevReaction === null) {
      setCount((c) => c + 1);
      setUserReaction(type);
    } else if (prevReaction === type) {
      setCount((c) => Math.max(c - 1, 0));
      setUserReaction(null);
    } else {
      setUserReaction(type); // Count unchanged
    }

    try {
      const result = await reactToPostAction({ postId, reactionType: type });
      if ("errorCode" in result) {
        // Rollback optimistic update
        setCount(prevCount);
        setUserReaction(prevReaction);
      } else {
        // Sync with server's authoritative delta from pre-optimistic baseline
        // (prevCount is saved before optimistic update — avoids double-counting)
        setCount(prevCount + result.countDelta);
        setUserReaction(result.newReactionType);
      }
    } catch {
      setCount(prevCount);
      setUserReaction(prevReaction);
    } finally {
      setIsPending(false);
    }
  };

  const currentEmoji = userReaction ? REACTION_EMOJIS[userReaction] : "👍";

  return (
    <div ref={containerRef} className="relative">
      {/* Reaction trigger button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => void handleTogglePicker()}
        disabled={isPending}
        aria-label={t("reactions.reactAriaLabel")}
        aria-pressed={userReaction !== null}
        aria-expanded={isPickerOpen}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium min-h-[36px] border transition-colors ${
          userReaction
            ? "bg-primary/10 border-primary/30 text-primary"
            : "border-border bg-background text-muted-foreground hover:bg-accent"
        }`}
      >
        <span aria-hidden="true">{currentEmoji}</span>
        <span>{count > 0 ? t("reactions.reactionCount", { count }) : t("reactions.react")}</span>
      </button>

      {/* Reaction picker popover */}
      {isPickerOpen && (
        <div
          role="dialog"
          aria-label={t("reactions.pickerLabel")}
          className="absolute bottom-full mb-2 left-0 z-50 flex gap-1 rounded-full border border-border bg-card p-2 shadow-lg"
        >
          {REACTION_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => void handleReact(type)}
              aria-label={t(`reactions.${type}` as Parameters<typeof t>[0])}
              aria-pressed={userReaction === type}
              className={`flex h-10 w-10 items-center justify-center rounded-full text-xl transition-transform hover:scale-125 min-h-[40px] ${
                userReaction === type ? "bg-primary/20 scale-110" : "hover:bg-accent"
              }`}
            >
              {REACTION_EMOJIS[type]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
