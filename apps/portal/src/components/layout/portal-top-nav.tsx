"use client";

import { useState, useEffect } from "react";
import { signOut } from "next-auth/react";
import { MenuIcon, XIcon, BriefcaseIcon, ArrowLeftIcon, LogOutIcon } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useActivePortalRole } from "@/hooks/use-active-portal-role";
import { buildSignInUrl } from "@/lib/guest-utils";
import { RoleSwitcher } from "./role-switcher";

function getCommunityUrl() {
  return process.env.NEXT_PUBLIC_COMMUNITY_URL ?? "http://localhost:3000";
}

function getPortalUrl() {
  return process.env.NEXT_PUBLIC_PORTAL_URL ?? "http://localhost:3001";
}

interface NavLink {
  key: string;
  href: string;
  label: string;
}

export function PortalTopNav({ className }: { className?: string }) {
  const t = useTranslations("Portal.nav");
  const locale = useLocale();
  const { isSeeker, isEmployer, isAdmin, isAuthenticated } = useActivePortalRole();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [loginCallbackUrl, setLoginCallbackUrl] = useState(`${getPortalUrl()}/${locale}`);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    setLoginCallbackUrl(window.location.href);
  }, []);
  const communityUrl = getCommunityUrl();

  const seekerLinks: NavLink[] = [
    { key: "jobs", href: `/${locale}/jobs`, label: t("jobs") },
    { key: "browseAll", href: `/${locale}/search`, label: t("browseAll") },
    { key: "apprenticeships", href: `/${locale}/apprenticeships`, label: t("apprenticeships") },
    { key: "myApplications", href: `/${locale}/applications`, label: t("myApplications") },
    { key: "savedJobs", href: `/${locale}/saved-jobs`, label: t("savedJobs") },
    { key: "savedSearches", href: `/${locale}/saved-searches`, label: t("savedSearches") },
  ];

  const employerLinks: NavLink[] = [
    { key: "dashboard", href: `/${locale}/dashboard`, label: t("dashboard") },
    { key: "myJobs", href: `/${locale}/my-jobs`, label: t("myJobs") },
    { key: "messages", href: `/${locale}/messages`, label: t("messages") },
    { key: "companyProfile", href: `/${locale}/company-profile`, label: t("companyProfile") },
  ];

  const adminLinks: NavLink[] = [
    { key: "reviewQueue", href: `/${locale}/admin`, label: t("reviewQueue") },
    { key: "allPostings", href: `/${locale}/admin/postings`, label: t("allPostings") },
    { key: "employers", href: `/${locale}/admin/employers`, label: t("employers") },
    {
      key: "screeningKeywords",
      href: `/${locale}/admin/screening/keywords`,
      label: t("screeningKeywords"),
    },
    { key: "violations", href: `/${locale}/admin/violations`, label: t("violations") },
    { key: "verifications", href: `/${locale}/admin/verifications`, label: t("verifications") },
    { key: "reports", href: `/${locale}/admin/reports`, label: t("reports") },
    { key: "analytics", href: `/${locale}/admin/analytics`, label: t("analytics") },
    { key: "auditLog", href: `/${locale}/admin/audit-logs`, label: t("auditLog") },
  ];

  const guestLinks: NavLink[] = [
    { key: "discover", href: `/${locale}/jobs`, label: t("discover") },
    { key: "browseAll", href: `/${locale}/search`, label: t("browseAll") },
    { key: "apprenticeships", href: `/${locale}/apprenticeships`, label: t("apprenticeships") },
  ];

  const navLinks = isEmployer
    ? employerLinks
    : isAdmin
      ? adminLinks
      : isSeeker
        ? seekerLinks
        : guestLinks;

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
          aria-label={t("logoAriaLabel")}
        >
          <BriefcaseIcon className="size-6 text-primary" aria-hidden="true" />
          <span className="text-primary font-bold hidden sm:inline">OBIGBO</span>
        </a>

        {/* Desktop nav links */}
        <nav
          aria-label={t("portalNavAriaLabel")}
          className="hidden lg:flex items-center gap-1 ml-6"
        >
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

          {/* Role switcher / indicator (hidden on mobile — Sheet has its own instance) */}
          <div className="hidden sm:flex">
            <RoleSwitcher />
          </div>

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
                <a
                  href={buildSignInUrl(communityUrl, loginCallbackUrl)}
                  data-testid="desktop-login-link"
                >
                  {t("login")}
                </a>
              </Button>
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <a href={`${communityUrl}/join`}>{t("joinNow")}</a>
              </Button>
            </>
          )}

          {/* Logout button for authenticated users */}
          {isAuthenticated && (
            <button
              type="button"
              onClick={() => void signOut({ callbackUrl: communityUrl })}
              aria-label={t("logout")}
              data-testid="logout-button"
              className="hidden sm:flex items-center gap-1.5 min-h-[44px] px-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <LogOutIcon className="size-4" aria-hidden="true" />
              {t("logout")}
            </button>
          )}

          {/* Mobile hamburger — client-only to avoid Radix aria-controls hydration mismatch */}
          {mounted ? (
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
                    {isAuthenticated ? <RoleSwitcher /> : "OBIGBO Job Portal"}
                  </SheetTitle>
                </SheetHeader>
                <nav aria-label={t("mobileNavAriaLabel")} className="flex flex-col py-4 gap-1">
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
                  {isAuthenticated && (
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        void signOut({ callbackUrl: communityUrl });
                      }}
                      data-testid="logout-button-mobile"
                      className="flex items-center gap-2 min-h-[44px] px-4 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors rounded-md w-full text-left"
                    >
                      <LogOutIcon className="size-4" aria-hidden="true" />
                      {t("logout")}
                    </button>
                  )}
                  {!isAuthenticated && (
                    <>
                      <a
                        href={buildSignInUrl(communityUrl, loginCallbackUrl)}
                        data-testid="mobile-login-link"
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
          ) : (
            <button
              type="button"
              aria-label={t("openMenuAriaLabel")}
              className="flex lg:hidden items-center justify-center h-11 w-11 rounded-md text-muted-foreground hover:bg-accent transition-colors"
            >
              <MenuIcon className="size-5" aria-hidden="true" />
            </button>
          )}
        </div>
      </header>
    </>
  );
}
