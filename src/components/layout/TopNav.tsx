"use client";

import { useState } from "react";
import {
  UserCircleIcon,
  LogOutIcon,
  UserIcon,
  SettingsIcon,
  MenuIcon,
  XIcon,
  PenLineIcon,
  BookOpenIcon,
  StarIcon,
  SearchIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useSession, signOut } from "next-auth/react";
import Image from "next/image";
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
import { GlobalSearchBar } from "./GlobalSearchBar";

const navLinks = [
  { key: "home" as const, href: "/dashboard" },
  { key: "feed" as const, href: "/feed" },
  { key: "saved" as const, href: "/saved" },
  { key: "chat" as const, href: "/chat" },
  { key: "discover" as const, href: "/discover" },
  { key: "events" as const, href: "/events" },
] as const;

function TopNav({ className }: { className?: string }) {
  const t = useTranslations("Navigation");
  const tShell = useTranslations("Shell");
  const tArticles = useTranslations("Articles");
  const { data: session } = useSession();
  const displayName = session?.user?.name ?? "";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-40 flex h-16 w-full items-center border-b border-border bg-background px-4",
          className,
        )}
      >
        {/* Logo */}
        <Link
          href="/dashboard"
          className="flex items-center gap-2 min-h-[44px] min-w-[44px] font-semibold text-foreground"
          aria-label={tShell("appName")}
        >
          <Image
            src="/obigbo-logo.png"
            alt="OBIGBO"
            width={36}
            height={36}
            className="rounded-full"
            priority
          />
          <span className="text-primary font-bold">OBIGBO</span>
        </Link>

        {/* Hamburger button — visible only on mobile */}
        <button
          type="button"
          aria-label={mobileMenuOpen ? tShell("menuClose") : tShell("menuOpen")}
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-nav"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          className="flex md:hidden items-center justify-center h-11 w-11 min-h-[44px] min-w-[44px] rounded-md text-muted-foreground hover:bg-accent transition-colors ml-2"
        >
          {mobileMenuOpen ? (
            <XIcon className="size-5" aria-hidden="true" />
          ) : (
            <MenuIcon className="size-5" aria-hidden="true" />
          )}
        </button>

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

        {/* Global search — hidden on mobile */}
        <GlobalSearchBar className="hidden md:flex" />

        {/* Spacer — pushes right actions to the far right */}
        <div className="flex-1" />

        {/* Right actions */}
        <div className="flex items-center gap-1">
          {/* Mobile search icon — hidden on desktop where GlobalSearchBar is inline */}
          <Link
            href="/search"
            aria-label={t("search")}
            className="flex md:hidden items-center justify-center h-11 w-11 min-h-[44px] min-w-[44px] rounded-md text-muted-foreground hover:bg-accent transition-colors"
          >
            <SearchIcon className="size-5" aria-hidden="true" />
          </Link>

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
                suppressHydrationWarning
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
                <Link
                  href={`/profiles/${session?.user?.id ?? ""}`}
                  className="flex items-center gap-2 cursor-pointer"
                >
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
              <DropdownMenuItem asChild>
                <Link href="/articles/new" className="flex items-center gap-2 cursor-pointer">
                  <PenLineIcon className="size-4" aria-hidden="true" />
                  {tArticles("nav.writeArticle")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/my-articles" className="flex items-center gap-2 cursor-pointer">
                  <BookOpenIcon className="size-4" aria-hidden="true" />
                  {tArticles("myArticles.title")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/points" className="flex items-center gap-2 cursor-pointer">
                  <StarIcon className="size-4" aria-hidden="true" />
                  {t("points")}
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

      {/* Mobile nav panel — shown below header when hamburger is open */}
      {mobileMenuOpen && (
        <nav
          id="mobile-nav"
          aria-label="Main navigation"
          className="md:hidden fixed inset-x-0 top-16 z-30 border-b border-border bg-background shadow-md"
        >
          <ul className="flex flex-col py-2">
            {navLinks.map(({ key, href }) => (
              <li key={key}>
                <Link
                  href={href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center min-h-[44px] px-6 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  {t(key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </>
  );
}

export { TopNav };
