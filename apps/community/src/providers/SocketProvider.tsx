"use client";

import { createContext, useContext, useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { env } from "@/env";
import type { Socket } from "socket.io-client";

type ConnectionPhase = "connected" | "reconnecting" | "lost";

interface SocketContextValue {
  notificationsSocket: Socket | null;
  chatSocket: Socket | null;
  isConnected: boolean;
  connectionPhase: ConnectionPhase;
}

const SocketContext = createContext<SocketContextValue>({
  notificationsSocket: null,
  chatSocket: null,
  isConnected: false,
  connectionPhase: "connected",
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
 * - Tracks connectionPhase: 'connected' | 'reconnecting' | 'lost'
 *   - 0–5s disconnected: phase stays 'reconnecting' (no UI, brief hiccup)
 *   - 5–15s disconnected: phase 'reconnecting' (amber bar "Reconnecting...")
 *   - >15s disconnected: phase 'lost' (persistent amber bar + retry button)
 *   - Reconnected: phase 'connected' (brief green flash)
 * - On reconnect, emits sync:request per namespace with correct payload key
 */
export function SocketProvider({ children }: SocketProviderProps) {
  const { data: session, status } = useSession();
  const [isConnected, setIsConnected] = useState(false);
  const [connectionPhase, setConnectionPhase] = useState<ConnectionPhase>("connected");
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
  // Timestamp when disconnect started (for phase transitions)
  const disconnectedAtRef = useRef<number | null>(null);
  // Interval for polling disconnection elapsed time
  const phaseIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Last received message timestamps per namespace (for sync:request on reconnect)
  const lastChatTimestampRef = useRef<string | null>(null);
  const lastNotifTimestampRef = useRef<string | null>(null);
  // Per-socket reconnect flag: true if the socket was previously connected and then disconnected
  const chatWasDisconnectedRef = useRef(false);
  const notifWasDisconnectedRef = useRef(false);

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
      setConnectionPhase("connected");
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
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      };

      function updateConnectedState() {
        if (mountedRef.current && connectionIdRef.current === thisConnectionId) {
          setIsConnected(notifConnectedRef.current || chatConnectedRef.current);
        }
      }

      function startDisconnectPhaseTracking() {
        if (!mountedRef.current || connectionIdRef.current !== thisConnectionId) return;
        disconnectedAtRef.current = Date.now();
        if (phaseIntervalRef.current) clearInterval(phaseIntervalRef.current);
        phaseIntervalRef.current = setInterval(() => {
          if (!mountedRef.current || connectionIdRef.current !== thisConnectionId) {
            if (phaseIntervalRef.current) clearInterval(phaseIntervalRef.current);
            return;
          }
          const elapsed =
            disconnectedAtRef.current !== null ? Date.now() - disconnectedAtRef.current : 0;
          if (elapsed > 15_000) {
            setConnectionPhase("lost");
          } else {
            setConnectionPhase("reconnecting");
          }
        }, 250);
      }

      function stopDisconnectPhaseTracking() {
        if (phaseIntervalRef.current) {
          clearInterval(phaseIntervalRef.current);
          phaseIntervalRef.current = null;
        }
        disconnectedAtRef.current = null;
      }

      // Connect /notifications namespace
      const notifSocket = io(`${realtimeUrl}/notifications`, socketOptions);

      notifSocket.on("connect", () => {
        notifConnectedRef.current = true;
        updateConnectedState();

        const wasDisconnected = notifWasDisconnectedRef.current;
        notifWasDisconnectedRef.current = false;

        // Stop phase tracking — any single reconnect is sufficient since
        // tracking only starts when both namespaces are disconnected
        stopDisconnectPhaseTracking();
        if (mountedRef.current && connectionIdRef.current === thisConnectionId) {
          setConnectionPhase("connected");
        }

        // Emit sync:request on reconnect to replay missed notifications
        if (wasDisconnected && lastNotifTimestampRef.current) {
          notifSocket.emit("sync:request", {
            lastTimestamp: lastNotifTimestampRef.current,
          });
        }
      });
      notifSocket.on("disconnect", () => {
        notifConnectedRef.current = false;
        notifWasDisconnectedRef.current = true;
        updateConnectedState();
        // Only start phase tracking if chat is also disconnected
        if (!chatConnectedRef.current) {
          startDisconnectPhaseTracking();
        }
      });

      // Track last received notification timestamp for sync replay
      notifSocket.on("notification:new", (payload: { timestamp?: string; createdAt?: string }) => {
        const ts = payload?.timestamp ?? payload?.createdAt;
        if (ts) lastNotifTimestampRef.current = ts;
      });

      if (mountedRef.current && connectionIdRef.current === thisConnectionId) {
        setNotificationsSocket(notifSocket);
      }

      // Connect /chat namespace
      const chatSock = io(`${realtimeUrl}/chat`, socketOptions);

      chatSock.on("connect", () => {
        chatConnectedRef.current = true;
        updateConnectedState();

        const wasDisconnected = chatWasDisconnectedRef.current;
        chatWasDisconnectedRef.current = false;

        stopDisconnectPhaseTracking();
        if (mountedRef.current && connectionIdRef.current === thisConnectionId) {
          setConnectionPhase("connected");
        }

        // Emit sync:request on reconnect to replay missed chat messages
        if (wasDisconnected && lastChatTimestampRef.current) {
          chatSock.emit("sync:request", {
            lastReceivedAt: lastChatTimestampRef.current,
          });
        }
      });
      chatSock.on("disconnect", () => {
        chatConnectedRef.current = false;
        chatWasDisconnectedRef.current = true;
        updateConnectedState();
        // Only start phase tracking if notif is also disconnected
        if (!notifConnectedRef.current) {
          startDisconnectPhaseTracking();
        }
      });

      // Track last received chat message timestamp for sync replay
      chatSock.on("message:new", (payload: { createdAt?: string; timestamp?: string }) => {
        const ts = payload?.createdAt ?? payload?.timestamp;
        if (ts) lastChatTimestampRef.current = ts;
      });

      if (mountedRef.current && connectionIdRef.current === thisConnectionId) {
        setChatSocket(chatSock);
      }
    })();

    return () => {
      mountedRef.current = false;
      notifConnectedRef.current = false;
      chatConnectedRef.current = false;
      notifWasDisconnectedRef.current = false;
      chatWasDisconnectedRef.current = false;
      if (phaseIntervalRef.current) {
        clearInterval(phaseIntervalRef.current);
        phaseIntervalRef.current = null;
      }
      setNotificationsSocket((prev) => {
        prev?.disconnect();
        return null;
      });
      setChatSocket((prev) => {
        prev?.disconnect();
        return null;
      });
      setIsConnected(false);
      setConnectionPhase("connected");
    };
  }, [status, sessionToken]);

  return (
    <SocketContext.Provider
      value={{
        notificationsSocket,
        chatSocket,
        isConnected,
        connectionPhase,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}
