"use client";

import { createContext, useContext, useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { env } from "@/env";
import type { Socket } from "socket.io-client";

interface SocketContextValue {
  notificationsSocket: Socket | null;
  chatSocket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextValue>({
  notificationsSocket: null,
  chatSocket: null,
  isConnected: false,
});

export function useSocketContext(): SocketContextValue {
  return useContext(SocketContext);
}

interface SocketProviderProps {
  children: React.ReactNode;
}

/**
 * SocketProvider — manages WebSocket connection lifecycle.
 * - Connects on auth, disconnects on logout
 * - Dynamically imports socket.io-client to avoid loading on unauthenticated pages
 * - Manages /notifications and /chat namespaces
 * - Uses session.sessionToken (exposed via Auth.js session callback) for Socket.IO auth
 * - Uses useState for sockets so consumers re-render when sockets become available
 * - Tracks isConnected = true when EITHER namespace is connected
 */
export function SocketProvider({ children }: SocketProviderProps) {
  const { data: session, status } = useSession();
  const [isConnected, setIsConnected] = useState(false);
  const [notificationsSocket, setNotificationsSocket] = useState<Socket | null>(null);
  const [chatSocket, setChatSocket] = useState<Socket | null>(null);
  // Track session token to avoid reconnect churn on session object reference changes
  const sessionToken = (session as { sessionToken?: string } | null)?.sessionToken;
  // Track connection state of each namespace independently
  const notifConnectedRef = useRef(false);
  const chatConnectedRef = useRef(false);
  // Ref to track cleanup so async import doesn't update state after unmount
  const mountedRef = useRef(true);
  // Ref to track the connection attempt ID so stale async callbacks are discarded
  const connectionIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    const thisConnectionId = ++connectionIdRef.current;

    if (status !== "authenticated" || !sessionToken) {
      // Disconnect if session ends
      setNotificationsSocket((prev) => {
        prev?.disconnect();
        return null;
      });
      setChatSocket((prev) => {
        prev?.disconnect();
        return null;
      });
      notifConnectedRef.current = false;
      chatConnectedRef.current = false;
      setIsConnected(false);
      return;
    }

    void (async () => {
      // Dynamic import to avoid loading socket.io-client on public pages
      const { io } = await import("socket.io-client");
      if (!mountedRef.current || connectionIdRef.current !== thisConnectionId) return;

      const realtimeUrl = env.NEXT_PUBLIC_REALTIME_URL;
      const socketOptions = {
        auth: { token: sessionToken },
        transports: ["websocket", "polling"] as ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      };

      function updateConnectedState() {
        if (mountedRef.current && connectionIdRef.current === thisConnectionId) {
          setIsConnected(notifConnectedRef.current || chatConnectedRef.current);
        }
      }

      // Connect /notifications namespace
      const notifSocket = io(`${realtimeUrl}/notifications`, socketOptions);

      notifSocket.on("connect", () => {
        notifConnectedRef.current = true;
        updateConnectedState();
      });
      notifSocket.on("disconnect", () => {
        notifConnectedRef.current = false;
        updateConnectedState();
      });

      if (mountedRef.current && connectionIdRef.current === thisConnectionId) {
        setNotificationsSocket(notifSocket);
      }

      // Connect /chat namespace
      const chatSock = io(`${realtimeUrl}/chat`, socketOptions);

      chatSock.on("connect", () => {
        chatConnectedRef.current = true;
        updateConnectedState();
      });
      chatSock.on("disconnect", () => {
        chatConnectedRef.current = false;
        updateConnectedState();
      });

      if (mountedRef.current && connectionIdRef.current === thisConnectionId) {
        setChatSocket(chatSock);
      }
    })();

    return () => {
      mountedRef.current = false;
      notifConnectedRef.current = false;
      chatConnectedRef.current = false;
      setNotificationsSocket((prev) => {
        prev?.disconnect();
        return null;
      });
      setChatSocket((prev) => {
        prev?.disconnect();
        return null;
      });
      setIsConnected(false);
    };
  }, [status, sessionToken]);

  return (
    <SocketContext.Provider
      value={{
        notificationsSocket,
        chatSocket,
        isConnected,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}
