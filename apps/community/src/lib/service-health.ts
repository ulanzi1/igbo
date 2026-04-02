"use client";

import { useMemo } from "react";
import { useSocketContext } from "@/providers/SocketProvider";

export interface ServiceHealth {
  chatAvailable: boolean;
  videoAvailable: boolean;
  degradedServices: string[];
}

/**
 * Client-side service health tracker.
 *
 * - Chat availability: derived from Socket.IO /chat namespace connection phase.
 *   When connectionPhase is 'lost', chat is considered unavailable.
 * - Video availability: derived from NEXT_PUBLIC_DAILY_ENABLED env var (feature flag).
 *   If Daily.co is disabled or key is missing, video is unavailable.
 */
export function useServiceHealth(): ServiceHealth {
  const { connectionPhase } = useSocketContext();

  // Chat unavailable when connection is 'lost' (>15s disconnected after max retries)
  const chatAvailable = connectionPhase !== "lost";

  // Video availability: environment-based feature flag (explicit opt-in required)
  const videoAvailable = process.env.NEXT_PUBLIC_DAILY_ENABLED === "true";

  const degradedServices = useMemo(() => {
    const degraded: string[] = [];
    if (!chatAvailable) degraded.push("chat");
    if (!videoAvailable) degraded.push("video");
    return degraded;
  }, [chatAvailable, videoAvailable]);

  return { chatAvailable, videoAvailable, degradedServices };
}
