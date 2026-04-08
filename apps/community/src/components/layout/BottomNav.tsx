"use client";

import { HouseIcon, MessageCircleIcon, SearchIcon, NewspaperIcon, UserIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { usePathname, Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { useUnreadCount } from "@/features/chat/hooks/use-unread-count";

function BottomNav() {
  const t = useTranslations("Navigation");
  const pathname = usePathname();
  const { data: session } = useSession();
  const { totalUnread } = useUnreadCount();

  const tabs = [
    { key: "home" as const, icon: HouseIcon, href: "/" },
    { key: "chat" as const, icon: MessageCircleIcon, href: "/chat" },
    { key: "feed" as const, icon: NewspaperIcon, href: "/feed" },
    { key: "discover" as const, icon: SearchIcon, href: "/discover" },
    { key: "profile" as const, icon: UserIcon, href: `/profiles/${session?.user?.id ?? ""}` },
  ];
  const unreadLabel = t("chatUnread", { count: totalUnread });

  return (
    <nav
      role="navigation"
      aria-label={t("mainNavLabel")}
      className="fixed bottom-0 left-0 right-0 z-50 flex h-14 items-stretch border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {tabs.map(({ key, icon: Icon, href }) => {
        const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));
        const isChatTab = key === "chat";
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
            <div className="relative">
              <Icon className="size-5" aria-hidden="true" />
              {isChatTab && totalUnread > 0 && (
                <span
                  className="absolute -top-1 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-0.5 text-[10px] font-bold text-destructive-foreground"
                  role="status"
                  aria-label={unreadLabel}
                >
                  {totalUnread > 99 ? "99+" : totalUnread}
                </span>
              )}
            </div>
            <span>{t(key)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export { BottomNav };
