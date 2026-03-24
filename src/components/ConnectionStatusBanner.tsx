"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useSocketContext } from "@/providers/SocketProvider";

/**
 * Reconnection phase UI banner (Task 1.4):
 * - 0–5s disconnected: No visual change (Socket.IO auto-reconnecting)
 * - 5–15s disconnected: Subtle amber bar "Reconnecting..." with pulse
 * - >15s disconnected: Persistent amber bar "Connection lost" + Retry button
 * - Reconnected: Brief green flash "Connected" that auto-dismisses after 2s
 */
export function ConnectionStatusBanner() {
  const t = useTranslations("Shell");
  const { connectionPhase } = useSocketContext();
  const [delayPassed, setDelayPassed] = useState(false);
  const [showReconnected, setShowReconnected] = useState(false);
  const prevPhaseRef = useRef(connectionPhase);

  // 5s delay for reconnecting banner — setState only in setTimeout callback
  useEffect(() => {
    if (connectionPhase !== "reconnecting") return;
    const timer = setTimeout(() => setDelayPassed(true), 5000);
    return () => clearTimeout(timer);
  }, [connectionPhase]);

  // Reset delay when phase changes away from reconnecting
  useEffect(() => {
    if (connectionPhase === "reconnecting") return;
    const timer = setTimeout(() => setDelayPassed(false), 0);
    return () => clearTimeout(timer);
  }, [connectionPhase]);

  // Show reconnected flash on transition from disconnected → connected
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = connectionPhase;
    if (connectionPhase !== "connected") return;
    if (prev !== "reconnecting" && prev !== "lost") return;
    const timer = setTimeout(() => setShowReconnected(true), 0);
    return () => clearTimeout(timer);
  }, [connectionPhase]);

  // Auto-dismiss the reconnected flash after 2s
  useEffect(() => {
    if (!showReconnected) return;
    const timer = setTimeout(() => setShowReconnected(false), 2000);
    return () => clearTimeout(timer);
  }, [showReconnected]);

  // Derive banner visibility — no useState needed
  const showBanner =
    connectionPhase === "lost" || (connectionPhase === "reconnecting" && delayPassed);

  if (showReconnected) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-center gap-2 bg-green-50 border-b border-green-200 px-4 py-1.5 text-sm text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-200"
      >
        <span>{t("socketReconnected")}</span>
      </div>
    );
  }

  if (!showBanner) return null;

  if (connectionPhase === "lost") {
    return (
      <div
        role="status"
        aria-live="assertive"
        className="flex items-center justify-center gap-2 bg-amber-50 border-b border-amber-200 px-4 py-1.5 text-sm text-amber-800 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-200"
      >
        <span>{t("socketConnectionLost")}</span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="ml-2 rounded px-2 py-0.5 text-xs font-medium bg-amber-200 hover:bg-amber-300 dark:bg-amber-800 dark:hover:bg-amber-700"
        >
          {t("socketRetry")}
        </button>
      </div>
    );
  }

  // connectionPhase === "reconnecting" (visible after 5s delay)
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 bg-amber-50 border-b border-amber-200 px-4 py-1.5 text-sm text-amber-800 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-200 animate-pulse"
    >
      <span>{t("socketReconnecting")}</span>
    </div>
  );
}
