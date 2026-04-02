"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useFollow } from "../hooks/use-follow";

interface FollowButtonProps {
  targetUserId: string;
  targetName: string; // For aria-label
  size?: "sm" | "default";
  /** Pre-fetched from useFollowBatch — skips the individual GET on mount when provided. */
  initialIsFollowing?: boolean;
}

export function FollowButton({
  targetUserId,
  targetName,
  size = "default",
  initialIsFollowing,
}: FollowButtonProps) {
  const t = useTranslations("Profile");
  const { isFollowing, isLoading, follow, unfollow, isPending } = useFollow(
    targetUserId,
    initialIsFollowing,
  );

  if (isLoading) {
    return (
      <Button variant="outline" size={size} disabled aria-busy="true">
        {t("follow")}
      </Button>
    );
  }

  if (isFollowing) {
    return (
      <Button
        variant="outline"
        size={size}
        onClick={() => unfollow()}
        disabled={isPending}
        aria-label={t("followingAriaLabel", { name: targetName })}
        className="group"
      >
        {/* Show "Following" normally, "Unfollow" on hover/focus */}
        <span className="group-hover:hidden group-focus:hidden">{t("following")}</span>
        <span className="hidden group-hover:inline group-focus:inline">{t("unfollow")}</span>
      </Button>
    );
  }

  return (
    <Button
      variant="default"
      size={size}
      onClick={() => follow()}
      disabled={isPending}
      aria-label={t("followAriaLabel", { name: targetName })}
    >
      {t("follow")}
    </Button>
  );
}
