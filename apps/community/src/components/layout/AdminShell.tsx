"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { signOut } from "next-auth/react";
import { ChevronRightIcon, LogOutIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { key: "dashboard" as const, href: "/admin" },
  { key: "approvals" as const, href: "/admin/approvals" },
  { key: "articles" as const, href: "/admin/articles" },
  { key: "members" as const, href: "/admin/members" },
  { key: "moderation" as const, href: "/admin/moderation" },
  { key: "governance" as const, href: "/admin/governance" },
  { key: "gamification" as const, href: "/admin/gamification" },
  { key: "leaderboard" as const, href: "/admin/leaderboard" },
  { key: "analytics" as const, href: "/admin/analytics" },
  { key: "auditLog" as const, href: "/admin/audit-log" },
] as const;

type NavKey = (typeof NAV_LINKS)[number]["key"];

export function AdminSidebar() {
  const t = useTranslations("Admin");
  const pathname = usePathname();

  return (
    <aside className="w-64 flex-shrink-0 bg-zinc-900 border-r border-zinc-700 min-h-screen flex flex-col">
      <div className="px-6 py-5 border-b border-zinc-700">
        <span className="text-lg font-bold text-white">{t("siteTitle")}</span>
      </div>
      <nav className="flex-1 px-3 py-4" aria-label={t("navAriaLabel")}>
        <ul className="space-y-1">
          {NAV_LINKS.map(({ key, href }) => {
            const isActive =
              pathname.includes(href) && (href !== "/admin" || pathname.endsWith("/admin"));
            return (
              <li key={key}>
                <Link
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-zinc-700 text-white"
                      : "text-zinc-400 hover:bg-zinc-800 hover:text-white",
                  )}
                >
                  {t(`sidebar.${key}` as `sidebar.${NavKey}`)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="px-3 pb-4 border-t border-zinc-700 pt-3">
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
        >
          <LogOutIcon className="size-4" aria-hidden="true" />
          {t("signOut")}
        </button>
      </div>
    </aside>
  );
}

export interface Breadcrumb {
  label: string;
  href?: string;
}

interface AdminPageHeaderProps {
  title: string;
  breadcrumbs?: Breadcrumb[];
  actions?: React.ReactNode;
}

export function AdminPageHeader({ title, breadcrumbs, actions }: AdminPageHeaderProps) {
  return (
    <div className="border-b border-zinc-800 bg-zinc-950 px-6 py-5">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-2">
          <ol className="flex items-center gap-1 text-sm text-zinc-400">
            {breadcrumbs.map((crumb, idx) => (
              <li key={idx} className="flex items-center gap-1">
                {idx > 0 && <ChevronRightIcon className="size-3" aria-hidden="true" />}
                {crumb.href ? (
                  <Link href={crumb.href} className="hover:text-white transition-colors">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-zinc-300">
                    {crumb.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

function AdminQueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
      }),
  );
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <AdminQueryProvider>
      <div className="flex min-h-screen bg-zinc-950 text-white">
        <AdminSidebar />
        <main id="main-content" className="flex-1 overflow-auto" tabIndex={-1}>
          {children}
        </main>
      </div>
    </AdminQueryProvider>
  );
}
