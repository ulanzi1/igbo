"use client";

import {
  HomeIcon,
  BriefcaseIcon,
  FileTextIcon,
  MessageSquareIcon,
  UserIcon,
  LayoutDashboardIcon,
  LogInIcon,
  ShieldCheckIcon,
  BarChart3Icon,
  SettingsIcon,
} from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useActivePortalRole } from "@/hooks/use-active-portal-role";

interface BottomNavItem {
  key: string;
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
}

export function PortalBottomNav() {
  const t = useTranslations("Portal.nav");
  const locale = useLocale();
  const { isSeeker, isEmployer, isAdmin } = useActivePortalRole();
  const pathname = usePathname();
  const communityUrl = process.env.NEXT_PUBLIC_COMMUNITY_URL ?? "http://localhost:3000";

  const seekerItems: BottomNavItem[] = [
    { key: "home", href: `/${locale}`, label: t("home"), icon: HomeIcon },
    { key: "jobs", href: `/${locale}/jobs`, label: t("jobs"), icon: BriefcaseIcon },
    {
      key: "myApplications",
      href: `/${locale}/applications`,
      label: t("myApplications"),
      icon: FileTextIcon,
    },
    { key: "messages", href: `/${locale}/messages`, label: t("messages"), icon: MessageSquareIcon },
    { key: "profile", href: `/${locale}/profile`, label: t("profile"), icon: UserIcon },
  ];

  const employerItems: BottomNavItem[] = [
    { key: "home", href: `/${locale}`, label: t("home"), icon: HomeIcon },
    {
      key: "dashboard",
      href: `/${locale}/dashboard`,
      label: t("dashboard"),
      icon: LayoutDashboardIcon,
    },
    { key: "messages", href: `/${locale}/messages`, label: t("messages"), icon: MessageSquareIcon },
    { key: "profile", href: `/${locale}/profile`, label: t("profile"), icon: UserIcon },
  ];

  const adminItems: BottomNavItem[] = [
    { key: "home", href: `/${locale}`, label: t("home"), icon: HomeIcon },
    {
      key: "reviewQueue",
      href: `/${locale}/admin`,
      label: t("reviewQueue"),
      icon: ShieldCheckIcon,
    },
    { key: "reports", href: `/${locale}/admin/reports`, label: t("reports"), icon: BarChart3Icon },
    {
      key: "settings",
      href: `/${locale}/admin/settings`,
      label: t("settings"),
      icon: SettingsIcon,
    },
  ];

  const guestItems: BottomNavItem[] = [
    { key: "home", href: `/${locale}`, label: t("home"), icon: HomeIcon },
    { key: "browseAll", href: `/${locale}/jobs`, label: t("browseAll"), icon: BriefcaseIcon },
    { key: "login", href: `${communityUrl}/login`, label: t("login"), icon: LogInIcon },
  ];

  const items = isEmployer
    ? employerItems
    : isAdmin
      ? adminItems
      : isSeeker
        ? seekerItems
        : guestItems;

  return (
    <nav
      aria-label={t("bottomNavAriaLabel")}
      className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background"
    >
      <ul className="flex items-center justify-around h-16">
        {items.map(({ key, href, label, icon: Icon }) => {
          const localeRoot = `/${locale}`;
          const isActive = pathname === href || (href !== localeRoot && pathname.startsWith(href));
          return (
            <li key={key} className="flex-1">
              <a
                href={href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 h-full min-h-[44px] text-xs font-medium transition-colors",
                  isActive
                    ? "text-[oklch(0.45_0.09_160)]" // portal-context teal
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="size-5" aria-hidden={true} />
                <span>{label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
