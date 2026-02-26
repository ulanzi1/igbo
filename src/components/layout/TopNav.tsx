"use client";

import { UserCircleIcon, SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ContrastToggle } from "@/components/shared/ContrastToggle";
import { LanguageToggle } from "@/components/shared/LanguageToggle";
import { NotificationBell } from "@/features/notifications";
import { cn } from "@/lib/utils";

const navLinks = [
  { key: "home" as const, href: "/" },
  { key: "chat" as const, href: "/chat" },
  { key: "discover" as const, href: "/discover" },
  { key: "events" as const, href: "/events" },
] as const;

function TopNav({ className }: { className?: string }) {
  const t = useTranslations("Navigation");
  const tShell = useTranslations("Shell");

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

        {/* Profile avatar placeholder */}
        <button
          type="button"
          aria-label={t("profile")}
          className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-border bg-muted text-muted-foreground hover:bg-accent transition-colors"
        >
          <UserCircleIcon className="size-6" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

export { TopNav };
