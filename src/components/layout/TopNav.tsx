"use client";

import { UserCircleIcon, SearchIcon, LogOutIcon, UserIcon, SettingsIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSession, signOut } from "next-auth/react";
import { Link } from "@/i18n/navigation";
import { ContrastToggle } from "@/components/shared/ContrastToggle";
import { LanguageToggle } from "@/components/shared/LanguageToggle";
import { NotificationBell } from "@/features/notifications";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const navLinks = [
  { key: "home" as const, href: "/" },
  { key: "feed" as const, href: "/feed" },
  { key: "saved" as const, href: "/saved" },
  { key: "chat" as const, href: "/chat" },
  { key: "discover" as const, href: "/discover" },
  { key: "events" as const, href: "/events" },
] as const;

function TopNav({ className }: { className?: string }) {
  const t = useTranslations("Navigation");
  const tShell = useTranslations("Shell");
  const { data: session } = useSession();
  const displayName = session?.user?.name ?? "";

  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex h-16 w-full items-center border-b border-border bg-background px-4",
        className,
      )}
    >
      {/* Logo */}
      <Link
        href="/"
        className="flex items-center gap-2 min-h-[44px] min-w-[44px] font-semibold text-foreground"
        aria-label={tShell("appName")}
      >
        <span className="text-primary font-bold">Igbo</span>
      </Link>

      {/* Desktop nav links — hidden on mobile */}
      <nav aria-label="Main navigation" className="hidden md:flex items-center gap-1 ml-6">
        {navLinks.map(({ key, href }) => (
          <Link
            key={key}
            href={href}
            className="flex items-center min-h-[44px] px-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {t(key)}
          </Link>
        ))}
      </nav>

      {/* Search placeholder — hidden on mobile */}
      <div className="hidden md:flex flex-1 mx-4 max-w-xs">
        <div
          role="search"
          aria-label={t("search")}
          className="flex w-full items-center gap-2 rounded-full border border-border bg-muted px-4 h-10 text-sm text-muted-foreground cursor-pointer"
        >
          <SearchIcon className="size-4 shrink-0" aria-hidden="true" />
          <span>{t("search")}</span>
        </div>
      </div>

      {/* Spacer — pushes right actions to the far right */}
      <div className="flex-1" />

      {/* Right actions */}
      <div className="flex items-center gap-1">
        {/* Notification bell */}
        <NotificationBell />

        <ContrastToggle />
        <LanguageToggle />

        {/* Profile dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t("profile")}
              className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-border bg-muted text-muted-foreground hover:bg-accent transition-colors"
            >
              <UserCircleIcon className="size-6" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {displayName && (
              <>
                <DropdownMenuLabel className="font-normal">
                  <span className="block text-sm font-medium">{displayName}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem asChild>
              <Link href="/profile" className="flex items-center gap-2 cursor-pointer">
                <UserIcon className="size-4" aria-hidden="true" />
                {t("viewProfile")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings" className="flex items-center gap-2 cursor-pointer">
                <SettingsIcon className="size-4" aria-hidden="true" />
                {t("settings")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5">
              <LanguageToggle />
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => void signOut()}
              className="flex items-center gap-2 text-destructive focus:text-destructive cursor-pointer"
            >
              <LogOutIcon className="size-4" aria-hidden="true" />
              {t("logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

export { TopNav };
