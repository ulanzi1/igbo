"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { key: "dashboard" as const, href: "/admin" },
  { key: "approvals" as const, href: "/admin/approvals" },
  { key: "members" as const, href: "/admin/members" },
  { key: "moderation" as const, href: "/admin/moderation" },
  { key: "reports" as const, href: "/admin/reports" },
  { key: "analytics" as const, href: "/admin/analytics" },
  { key: "auditLog" as const, href: "/admin/audit-log" },
] as const;

type NavKey = (typeof NAV_LINKS)[number]["key"];

function AdminSidebar() {
  const t = useTranslations("Admin");
  const pathname = usePathname();

  return (
    <aside className="w-64 flex-shrink-0 bg-zinc-900 border-r border-zinc-700 min-h-screen flex flex-col">
      <div className="px-6 py-5 border-b border-zinc-700">
        <span className="text-lg font-bold text-white">OBIGBO Admin</span>
      </div>
      <nav className="flex-1 px-3 py-4" aria-label="Admin navigation">
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
    </aside>
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
