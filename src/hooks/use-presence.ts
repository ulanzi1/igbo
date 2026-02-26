"use client";

import { useEffect, useState } from "react";
import { useSocket } from "./use-socket";

interface PresenceState {
  [userId: string]: boolean;
}

/**
 * Hook for presence status subscription.
 * Subscribes to presence:update events from /notifications namespace.
 */
export function usePresence() {
  const { notificationsSocket } = useSocket();
  const [presence, setPresence] = useState<PresenceState>({});

  useEffect(() => {
    if (!notificationsSocket) return;

    function onPresenceUpdate(data: { userId: string; online: boolean }) {
      setPresence((prev) => ({ ...prev, [data.userId]: data.online }));
    }

    notificationsSocket.on("presence:update", onPresenceUpdate);

    return () => {
      notificationsSocket.off("presence:update", onPresenceUpdate);
    };
  }, [notificationsSocket]);

  return {
    presence,
    isOnline: (userId: string) => presence[userId] ?? false,
  };
}
