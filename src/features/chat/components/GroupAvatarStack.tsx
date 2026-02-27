"use client";

import { cn } from "@/lib/utils";

interface GroupMember {
  id: string;
  displayName: string;
  photoUrl: string | null;
}

interface GroupAvatarStackProps {
  members: GroupMember[];
  size?: "sm" | "md";
  className?: string;
}

/**
 * Renders 2–3 overlapping circular avatar thumbnails for group conversations.
 * Shows initials when no photo is available.
 */
export function GroupAvatarStack({ members, size = "sm", className }: GroupAvatarStackProps) {
  const visibleMembers = members.slice(0, 3);
  const avatarSize = size === "sm" ? "h-6 w-6" : "h-8 w-8";
  const offsetAmount = size === "sm" ? "-ml-2" : "-ml-2.5";
  const textSize = size === "sm" ? "text-[10px]" : "text-xs";

  const ariaLabel = members.map((m) => m.displayName).join(", ");

  return (
    <div role="group" aria-label={ariaLabel} className={cn("flex items-center", className)}>
      {visibleMembers.map((member, index) => (
        <div
          key={member.id}
          className={cn(
            avatarSize,
            "relative flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-background bg-muted",
            index > 0 && offsetAmount,
          )}
          style={{ zIndex: visibleMembers.length - index }}
        >
          {member.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={member.photoUrl}
              alt={member.displayName}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className={cn(textSize, "font-semibold text-muted-foreground")}>
              {member.displayName.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
