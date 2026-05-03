"use client";

import { signOut, useSession } from "next-auth/react";
import { BellIcon, LogOutIcon, UserIcon } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActivePortalRole } from "@/hooks/use-active-portal-role";

function getCommunityUrl() {
  return process.env.NEXT_PUBLIC_COMMUNITY_URL ?? "http://localhost:3000";
}

export function UserProfileDropdown() {
  const t = useTranslations("Portal.nav");
  const locale = useLocale();
  const { data: session } = useSession();
  const { isSeeker, isEmployer } = useActivePortalRole();

  const name = session?.user?.name ?? "";
  const image = session?.user?.image ?? "";
  const initials = name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const profileHref = isEmployer ? `/${locale}/company-profile` : `/${locale}/profile`;
  const communityUrl = getCommunityUrl();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center justify-center rounded-full min-h-[44px] min-w-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t("userMenuAriaLabel")}
          data-testid="user-profile-trigger"
        >
          <Avatar size="sm">
            {image ? <AvatarImage src={image} alt={name} /> : null}
            <AvatarFallback>
              {initials || <UserIcon className="size-4" aria-hidden="true" />}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {name ? (
          <DropdownMenuLabel>
            <span className="block truncate" data-testid="user-menu-name">
              {name}
            </span>
          </DropdownMenuLabel>
        ) : null}
        {(isSeeker || isEmployer) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href={profileHref} data-testid="profile-link">
                <UserIcon className="size-4" aria-hidden="true" />
                {t("profile")}
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a
                href={`/${locale}/settings/notifications`}
                data-testid="notification-settings-link"
              >
                <BellIcon className="size-4" aria-hidden="true" />
                {t("notificationSettings")}
              </a>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => void signOut({ callbackUrl: communityUrl })}
          data-testid="dropdown-logout"
        >
          <LogOutIcon className="size-4" aria-hidden="true" />
          {t("logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
