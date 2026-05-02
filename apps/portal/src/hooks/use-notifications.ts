"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { PortalNotification } from "@igbo/db/queries/portal-notifications";

export interface UseNotificationsReturn {
  notifications: PortalNotification[];
  isLoading: boolean;
  hasMore: boolean;
  error: string | null;
  /** Returns true on success, false on HTTP error (optimistic state already reverted). */
  markAsRead: (id: string) => Promise<boolean>;
  /** Returns true on success, false on HTTP error (optimistic state already reverted). */
  markAllAsRead: () => Promise<boolean>;
  /** Returns true on success, false on HTTP error (optimistic state already reverted). */
  dismiss: (id: string) => Promise<boolean>;
  loadMore: () => Promise<void>;
}

export function useNotifications(): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<PortalNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextCursorRef = useRef<string | null>(null);
  const fetchingRef = useRef(false);
  // Always-fresh snapshot of notifications so mutations can revert without
  // depending on React's lazy functional-updater execution timing.
  const latestNotificationsRef = useRef<PortalNotification[]>([]);
  latestNotificationsRef.current = notifications;

  const fetchPage = useCallback(async (cursor?: string) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setIsLoading(true);
    setError(null);
    try {
      const url = cursor
        ? `/api/v1/notifications?cursor=${encodeURIComponent(cursor)}`
        : "/api/v1/notifications";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch notifications");
      const body = (await res.json()) as {
        data: PortalNotification[];
        meta: { nextCursor: string | null };
      };
      if (cursor) {
        setNotifications((prev) => [...prev, ...body.data]);
      } else {
        setNotifications(body.data);
      }
      nextCursorRef.current = body.meta.nextCursor;
      setHasMore(body.meta.nextCursor !== null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notifications");
    } finally {
      fetchingRef.current = false;
      setIsLoading(false);
    }
  }, []);

  const markAsRead = useCallback(async (id: string): Promise<boolean> => {
    const prevNotifications = latestNotificationsRef.current;
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? new Date() } : n)),
    );
    try {
      const res = await fetch(`/api/v1/notifications/${id}/read`, { method: "PATCH" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return true;
    } catch {
      setNotifications(prevNotifications);
      return false;
    }
  }, []);

  const markAllAsRead = useCallback(async (): Promise<boolean> => {
    const now = new Date();
    const prevNotifications = latestNotificationsRef.current;
    setNotifications((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    try {
      const res = await fetch("/api/v1/notifications/mark-all-read", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return true;
    } catch {
      setNotifications(prevNotifications);
      return false;
    }
  }, []);

  const dismiss = useCallback(async (id: string): Promise<boolean> => {
    const prevNotifications = latestNotificationsRef.current;
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    try {
      const res = await fetch(`/api/v1/notifications/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return true;
    } catch {
      setNotifications(prevNotifications);
      return false;
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!nextCursorRef.current) return;
    await fetchPage(nextCursorRef.current);
  }, [fetchPage]);

  // Fetch first page on mount
  useEffect(() => {
    void fetchPage();
  }, [fetchPage]);

  return {
    notifications,
    isLoading,
    hasMore,
    error,
    markAsRead,
    markAllAsRead,
    dismiss,
    loadMore,
  };
}
