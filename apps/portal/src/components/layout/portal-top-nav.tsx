"use client";

import { useState } from "react";
import { MenuIcon, XIcon, BriefcaseIcon, ArrowLeftIcon, UserCircleIcon } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useActivePortalRole } from "@/hooks/use-active-portal-role";

function getCommunityUrl() {
  return process.env.NEXT_PUBLIC_COMMUNITY_URL ?? "http://localhost:3000";
}

interface NavLink {
  key: string;
  href: string;
  label: string;
}

export function PortalTopNav({ className }: { className?: string }) {
  const t = useTranslations("Portal.nav");
  const tRole = useTranslations("Portal.role");
  const locale = useLocale();
  const { role, isSeeker, isEmployer, isAdmin, isAuthenticated } = useActivePortalRole();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const communityUrl = getCommunityUrl();

  const seekerLinks: NavLink[] = [
    { key: "jobs", href: `/${locale}/jobs`, label: t("jobs") },
    { key: "browseAll", href: `/${locale}/jobs/browse`, label: t("browseAll") },
    { key: "apprenticeships", href: `/${locale}/apprenticeships`, label: t("apprenticeships") },
    { key: "myApplications", href: `/${locale}/applications`, label: t("myApplications") },
    { key: "savedJobs", href: `/${locale}/saved-jobs`, label: t("savedJobs") },
  ];

  const employerLinks: NavLink[] = [
    { key: "dashboard", href: `/${locale}/dashboard`, label: t("dashboard") },
    { key: "myJobs", href: `/${locale}/my-jobs`, label: t("myJobs") },
    { key: "applications", href: `/${locale}/applications`, label: t("applications") },
    { key: "messages", href: `/${locale}/messages`, label: t("messages") },
    { key: "companyProfile", href: `/${locale}/company-profile`, label: t("companyProfile") },
  ];

  const guestLinks: NavLink[] = [
    { key: "browseAll", href: `/${locale}/jobs`, label: t("browseAll") },
    { key: "apprenticeships", href: `/${locale}/apprenticeships`, label: t("apprenticeships") },
  ];

  const navLinks = isEmployer ? employerLinks : isSeeker || isAdmin ? seekerLinks : guestLinks;

  const roleLabel = isEmployer
    ? tRole("employer")
    : isAdmin
      ? tRole("admin")
      : isAuthenticated
        ? tRole("seeker")
        : null;

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-50 flex h-16 w-full items-center border-b border-border bg-background px-4",
          className,
        )}
      >
        {/* Logo */}
        <a
          href={`/${locale}`}
          className="flex items-center gap-2 min-h-[44px] min-w-[44px] font-semibold text-foreground"
          aria-label="OBIGBO Job Portal"
        >
          <BriefcaseIcon className="size-6 text-primary" aria-hidden="true" />
          <span className="text-primary font-bold hidden sm:inline">OBIGBO</span>
        </a>

        {/* Desktop nav links */}
        <nav aria-label="Portal navigation" className="hidden lg:flex items-center gap-1 ml-6">
          {navLinks.map(({ key, href, label }) => (
            <a
              key={key}
              href={href}
              className="flex items-center min-h-[44px] px-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {label}
            </a>
          ))}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right actions */}
        <div className="flex items-center gap-2">
          {/* Back to Community — always visible */}
          <a
            href={communityUrl}
            className="hidden sm:flex items-center gap-1.5 min-h-[44px] px-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            data-testid="back-to-community"
          >
            <ArrowLeftIcon className="size-4" aria-hidden="true" />
            {t("backToCommunity")}
          </a>

          {/* Role indicator badge */}
          {roleLabel && (
            <Badge variant="outline" className="hidden sm:inline-flex text-xs">
              {roleLabel}
            </Badge>
          )}

          {/* Employer CTA */}
          {isEmployer && (
            <Button asChild size="sm" variant="accent" className="hidden lg:inline-flex">
              <a href={`/${locale}/jobs/new`}>{t("postJob")}</a>
            </Button>
          )}

          {/* Guest: Login / Join Now */}
          {!isAuthenticated && (
            <>
              <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex">
                <a href={`${communityUrl}/login`}>{t("login")}</a>
              </Button>
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <a href={`${communityUrl}/join`}>{t("joinNow")}</a>
              </Button>
            </>
          )}

          {/* User avatar placeholder for authenticated */}
          {isAuthenticated && (
            <button
              type="button"
              aria-label={t("profile")}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground hover:bg-accent transition-colors"
            >
              <UserCircleIcon className="size-5" aria-hidden="true" />
            </button>
          )}

          {/* Mobile hamburger */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
                aria-expanded={mobileMenuOpen}
                className="flex lg:hidden items-center justify-center h-11 w-11 rounded-md text-muted-foreground hover:bg-accent transition-colors"
              >
                {mobileMenuOpen ? (
                  <XIcon className="size-5" aria-hidden="true" />
                ) : (
                  <MenuIcon className="size-5" aria-hidden="true" />
                )}
              </button>
            </SheetTrigger>
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>
                  {roleLabel ? (
                    <Badge variant="outline">{roleLabel}</Badge>
                  ) : (
                    "OBIGBO Job Portal"
                  )}
                </SheetTitle>
              </SheetHeader>
              <nav aria-label="Mobile portal navigation" className="flex flex-col py-4 gap-1">
                {navLinks.map(({ key, href, label }) => (
                  <a
                    key={key}
                    href={href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center min-h-[44px] px-4 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors rounded-md"
                  >
                    {label}
                  </a>
                ))}
                <div className="border-t border-border my-2" />
                <a
                  href={communityUrl}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 min-h-[44px] px-4 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors rounded-md"
                  data-testid="back-to-community-mobile"
                >
                  <ArrowLeftIcon className="size-4" aria-hidden="true" />
                  {t("backToCommunity")}
                </a>
                {!isAuthenticated && (
                  <>
                    <a
                      href={`${communityUrl}/login`}
                      className="flex items-center min-h-[44px] px-4 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors rounded-md"
                    >
                      {t("login")}
                    </a>
                    <a
                      href={`${communityUrl}/join`}
                      className="flex items-center min-h-[44px] px-4 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors rounded-md"
                    >
                      {t("joinNow")}
                    </a>
                  </>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </header>
    </>
  );
}
