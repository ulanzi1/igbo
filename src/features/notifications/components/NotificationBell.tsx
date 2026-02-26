"use client";

import { useState, useRef, useEffect } from "react";
import { BellIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useNotifications } from "@/hooks/use-notifications";
import { NotificationList } from "./NotificationList";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const t = useTranslations("Notifications");
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const { notifications, unreadCount, isLoading, error } = useNotifications();

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !buttonRef.current?.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleRead = async (id: string) => {
    try {
      await fetch(`/api/v1/notifications/${id}/read`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      // Non-critical — notification already marked read optimistically via socket
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await fetch("/api/v1/notifications/read-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      // Non-critical
    }
  };

  const displayCount = Math.min(unreadCount, 99);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={unreadCount > 0 ? t("unreadBadgeLabel", { count: displayCount }) : t("title")}
        aria-expanded={isOpen}
        aria-haspopup="true"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-muted-foreground hover:bg-muted transition-colors"
      >
        <BellIcon className="size-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            className={cn(
              "absolute right-1.5 top-1.5 flex min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground",
              displayCount >= 10 ? "min-w-[20px]" : "",
            )}
            aria-hidden="true"
          >
            {displayCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          ref={dropdownRef}
          role="dialog"
          aria-label={t("title")}
          className="absolute right-0 top-full mt-2 w-80 rounded-lg border border-border bg-popover shadow-lg ring-1 ring-black/5 z-50"
        >
          {/* Dropdown header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">{t("title")}</h3>
          </div>

          <NotificationList
            notifications={notifications}
            isLoading={isLoading}
            error={error}
            onRead={(id) => void handleRead(id)}
            onMarkAllRead={() => void handleMarkAllRead()}
          />
        </div>
      )}
    </div>
  );
}
