"use client";

import { useSocketContext } from "@/providers/SocketProvider";
import type { Socket } from "socket.io-client";

/**
 * Base hook for accessing socket connection state and instances.
 */
export function useSocket(): {
  notificationsSocket: Socket | null;
  chatSocket: Socket | null;
  isConnected: boolean;
} {
  return useSocketContext();
}
