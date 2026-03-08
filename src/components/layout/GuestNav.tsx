"use client";

import {
  MenuIcon,
  UserCircleIcon,
  LogOutIcon,
  UserIcon,
  SettingsIcon,
  LayoutDashboardIcon,
} from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useSession, signOut } from "next-auth/react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { ContrastToggle } from "@/components/shared/ContrastToggle";
import { LanguageToggle } from "@/components/shared/LanguageToggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

function GuestNav({ className }: { className?: string }) {
  const t = useTranslations("Navigation");
  const tShell = useTranslations("Shell");
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  const isLoggedIn = !!session?.user;
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
        href={isLoggedIn ? "/dashboard" : "/"}
        className="flex items-center gap-2 min-h-[44px] min-w-[44px] font-semibold"
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

      {/* Desktop nav links */}
      <nav aria-label="Guest navigation" className="hidden md:flex items-center gap-1 ml-6">
        <Link
          href="/about"
          className="flex items-center min-h-[44px] px-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {t("about")}
        </Link>
        <Link
          href="/articles"
          className="flex items-center min-h-[44px] px-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {t("articles")}
        </Link>
        <Link
          href="/events"
          className="flex items-center min-h-[44px] px-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {t("events")}
        </Link>
        <Link
          href="/blog"
          className="flex items-center min-h-[44px] px-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {t("blog")}
        </Link>
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Desktop right actions */}
      <div className="hidden md:flex items-center gap-2">
        <LanguageToggle />
        <ContrastToggle />

        {isLoggedIn ? (
          /* Profile dropdown for authenticated users */
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
                <Link href="/dashboard" className="flex items-center gap-2 cursor-pointer">
                  <LayoutDashboardIcon className="size-4" aria-hidden="true" />
                  {t("dashboard")}
                </Link>
              </DropdownMenuItem>
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
        ) : (
          /* Join + Login buttons for guests */
          <>
            <Button asChild variant="ghost" className="min-h-[44px]">
              <Link href="/login">{t("login")}</Link>
            </Button>
            <Button asChild variant="default" className="min-h-[44px]">
              <Link href="/apply">{t("join")}</Link>
            </Button>
          </>
        )}
      </div>

      {/* Mobile hamburger */}
      <button
        type="button"
        aria-label={menuOpen ? tShell("menuClose") : tShell("menuOpen")}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(true)}
        className="flex md:hidden h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-muted-foreground hover:bg-muted transition-colors"
      >
        <MenuIcon className="size-5" aria-hidden="true" />
      </button>

      {/* Mobile menu sheet */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="right" className="w-72">
          <SheetHeader>
            <SheetTitle className="text-left">{tShell("appName")}</SheetTitle>
          </SheetHeader>
          <nav aria-label="Mobile guest navigation" className="mt-6 flex flex-col gap-2">
            <Link
              href="/about"
              onClick={() => setMenuOpen(false)}
              className="flex items-center min-h-[44px] px-3 rounded-md text-sm font-medium hover:bg-muted transition-colors"
            >
              {t("about")}
            </Link>
            <Link
              href="/articles"
              onClick={() => setMenuOpen(false)}
              className="flex items-center min-h-[44px] px-3 rounded-md text-sm font-medium hover:bg-muted transition-colors"
            >
              {t("articles")}
            </Link>
            <Link
              href="/events"
              onClick={() => setMenuOpen(false)}
              className="flex items-center min-h-[44px] px-3 rounded-md text-sm font-medium hover:bg-muted transition-colors"
            >
              {t("events")}
            </Link>
            <Link
              href="/blog"
              onClick={() => setMenuOpen(false)}
              className="flex items-center min-h-[44px] px-3 rounded-md text-sm font-medium hover:bg-muted transition-colors"
            >
              {t("blog")}
            </Link>
            <div className="flex gap-2 pt-2">
              <LanguageToggle />
              <ContrastToggle />
            </div>

            {isLoggedIn ? (
              /* Authenticated mobile actions */
              <div className="flex flex-col gap-2 mt-4 border-t pt-4">
                {displayName && (
                  <p className="px-3 text-sm font-medium text-muted-foreground truncate">
                    {displayName}
                  </p>
                )}
                <Link
                  href="/dashboard"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 min-h-[44px] px-3 rounded-md text-sm font-medium hover:bg-muted transition-colors"
                >
                  <LayoutDashboardIcon className="size-4" aria-hidden="true" />
                  {t("dashboard")}
                </Link>
                <Link
                  href={`/profiles/${session?.user?.id ?? ""}`}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 min-h-[44px] px-3 rounded-md text-sm font-medium hover:bg-muted transition-colors"
                >
                  <UserIcon className="size-4" aria-hidden="true" />
                  {t("viewProfile")}
                </Link>
                <Link
                  href="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 min-h-[44px] px-3 rounded-md text-sm font-medium hover:bg-muted transition-colors"
                >
                  <SettingsIcon className="size-4" aria-hidden="true" />
                  {t("settings")}
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    void signOut();
                  }}
                  className="flex items-center gap-2 min-h-[44px] px-3 rounded-md text-sm font-medium text-destructive hover:bg-muted transition-colors"
                >
                  <LogOutIcon className="size-4" aria-hidden="true" />
                  {t("logout")}
                </button>
              </div>
            ) : (
              /* Guest mobile actions */
              <div className="flex flex-col gap-2 mt-4">
                <Button asChild variant="ghost" className="min-h-[44px]">
                  <Link href="/login" onClick={() => setMenuOpen(false)}>
                    {t("login")}
                  </Link>
                </Button>
                <Button asChild variant="default" className="min-h-[44px]">
                  <Link href="/apply" onClick={() => setMenuOpen(false)}>
                    {t("join")}
                  </Link>
                </Button>
              </div>
            )}
          </nav>
        </SheetContent>
      </Sheet>
    </header>
  );
}

export { GuestNav };
