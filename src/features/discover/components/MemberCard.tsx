"use client";

import { useTranslations } from "next-intl";
import { useTransition, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { createOrFindDirectConversation } from "@/features/chat/actions/create-conversation";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { FollowButton } from "@/features/profiles/components/FollowButton";
import { VerificationBadge } from "@/components/shared/VerificationBadge";
import { ReportDialog } from "@/components/shared/ReportDialog";
import type { MemberCardData } from "../types";

interface MemberCardProps {
  member: MemberCardData;
  viewerInterests: string[];
  onMessage?: (userId: string) => void; // Optional override; default uses createOrFindDirectConversation
  showFollowButton?: boolean; // default true
  viewerUserId?: string; // When provided, hides FollowButton on viewer's own card
  /** Pre-fetched follow status from grid-level useFollowBatch — skips per-card GET when provided. */
  initialIsFollowing?: boolean;
}

function buildLocation(city: string | null, country: string | null): string | null {
  if (city && country) return `${city}, ${country}`;
  return city ?? country ?? null;
}

export function MemberCard({
  member,
  viewerInterests,
  onMessage,
  showFollowButton = true,
  viewerUserId,
  initialIsFollowing,
}: MemberCardProps) {
  const t = useTranslations("Discover");
  const tReports = useTranslations("Reports");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showReport, setShowReport] = useState(false);

  const sharedCount = member.interests.filter((i) => viewerInterests.includes(i)).length;
  const location = buildLocation(member.locationCity, member.locationCountry);

  // Truncate bio to 80 chars
  const bioSnippet =
    member.bio && member.bio.length > 80 ? `${member.bio.slice(0, 80)}...` : member.bio;

  function handleCardClick() {
    router.push(`/profiles/${member.userId}`);
  }

  function handleMessage(e: React.MouseEvent) {
    e.stopPropagation(); // Don't trigger card click
    if (onMessage) {
      onMessage(member.userId);
      return;
    }
    startTransition(async () => {
      const result = await createOrFindDirectConversation(member.userId);
      if ("conversationId" in result) {
        router.push(`/chat/${result.conversationId}`);
      }
    });
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={t("viewProfile", { name: member.displayName })}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handleCardClick();
      }}
      className="flex cursor-pointer flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md"
    >
      {/* Avatar + Name */}
      <div className="flex items-center gap-3">
        <Avatar size="lg">
          <AvatarImage src={member.photoUrl ?? undefined} alt={member.displayName} />
          <AvatarFallback>
            {member.displayName
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="flex items-center gap-1 truncate font-semibold text-gray-900">
            {member.displayName}
            <VerificationBadge badgeType={member.badgeType} />
          </p>
          {location && <p className="truncate text-xs text-gray-500">{location}</p>}
        </div>
      </div>

      {/* Bio snippet */}
      {bioSnippet && <p className="line-clamp-2 text-sm text-gray-600">{bioSnippet}</p>}

      {/* Shared interests */}
      <p className="text-xs text-indigo-600">{t("sharedInterests", { count: sharedCount })}</p>

      {/* Follow button */}
      {showFollowButton !== false && member.userId !== viewerUserId && (
        <FollowButton
          targetUserId={member.userId}
          targetName={member.displayName}
          size="sm"
          initialIsFollowing={initialIsFollowing}
        />
      )}

      {/* Message button — minimum 44px tap target */}
      <button
        type="button"
        onClick={handleMessage}
        disabled={isPending}
        aria-label={t("messageButton")}
        className="mt-auto min-h-[44px] w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {isPending ? "..." : t("messageButton")}
      </button>

      {/* Report member — only visible for other members */}
      {member.userId !== viewerUserId && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowReport(true);
          }}
          aria-label={tReports("action.report")}
          className="text-xs text-muted-foreground hover:text-destructive min-h-[44px] transition-colors"
        >
          🚩 {tReports("action.report")}
        </button>
      )}

      {showReport && (
        <ReportDialog
          contentType="member"
          contentId={member.userId}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}
