"use client";

import { HouseIcon, MessageCircleIcon, SearchIcon, CalendarIcon, UserIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { key: "home" as const, icon: HouseIcon, href: "/" },
  { key: "chat" as const, icon: MessageCircleIcon, href: "/chat" },
  { key: "discover" as const, icon: SearchIcon, href: "/discover" },
  { key: "events" as const, icon: CalendarIcon, href: "/events" },
  { key: "profile" as const, icon: UserIcon, href: "/profile" },
];

function BottomNav() {
  const t = useTranslations("Navigation");
  const pathname = usePathname();

  return (
    <nav
      role="navigation"
      aria-label="Main navigation"
      className="fixed bottom-0 left-0 right-0 z-50 flex h-14 items-stretch border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {tabs.map(({ key, icon: Icon, href }) => {
        const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));
        return (
          <Link
            key={key}
            href={href}
            role="tab"
            aria-selected={isActive}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 min-h-[44px] text-xs font-medium transition-colors",
              isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-5" aria-hidden="true" />
            <span>{t(key)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export { BottomNav };
