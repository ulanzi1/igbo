"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import type { Socket } from "socket.io-client";

const REALTIME_URL = process.env.NEXT_PUBLIC_REALTIME_URL ?? "";

type ConnectionPhase = "connected" | "reconnecting" | "lost";

interface PortalSocketContextValue {
  portalSocket: Socket | null;
  isConnected: boolean;
  connectionPhase: ConnectionPhase;
}

const PortalSocketContext = createContext<PortalSocketContextValue>({
  portalSocket: null,
  isConnected: false,
  connectionPhase: "connected",
});

export function usePortalSocket(): PortalSocketContextValue {
  return useContext(PortalSocketContext);
}

interface SocketProviderProps {
  children: React.ReactNode;
}

/**
 * Portal SocketProvider — manages the /portal Socket.IO namespace connection.
 *
 * Design:
 * - Single namespace: /portal (no /notifications — portal uses community's)
 * - Auth via withCredentials: true (browser sends session cookies automatically)
 *   DO NOT use session.sessionToken — it's not available from useSession() in Auth.js v5
 * - sync:request fired on EVERY connect event (initial + reconnect) for gap catch-up
 * - Disconnect phase tracking: reconnecting (0–15s), lost (>15s)
 * - Dynamic import of socket.io-client to avoid SSR loading
 */
export function SocketProvider({ children }: SocketProviderProps) {
  const { status } = useSession();
  const [portalSocket, setPortalSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionPhase, setConnectionPhase] = useState<ConnectionPhase>("connected");

  const mountedRef = useRef(true);
  const connectionIdRef = useRef(0);
  const connectedRef = useRef(false);
  const wasDisconnectedRef = useRef(false);
  const disconnectedAtRef = useRef<number | null>(null);
  const phaseIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastReceivedAtRef = useRef<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    const thisId = ++connectionIdRef.current;

    if (status !== "authenticated") {
      setPortalSocket((prev) => {
        prev?.disconnect();
        return null;
      });
      connectedRef.current = false;
      setIsConnected(false);
      setConnectionPhase("connected");
      return;
    }

    void (async () => {
      const { io } = await import("socket.io-client");
      if (!mountedRef.current || connectionIdRef.current !== thisId) return;

      const sock = io(`${REALTIME_URL}/portal`, {
        // Auth via session cookie — withCredentials lets browser send cookies automatically.
        // DO NOT pass auth.token: session.sessionToken is undefined from useSession() in v5.
        withCredentials: true,
        transports: ["websocket", "polling"] as ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });

      function startPhaseTracking() {
        if (!mountedRef.current || connectionIdRef.current !== thisId) return;
        disconnectedAtRef.current = Date.now();
        if (phaseIntervalRef.current) clearInterval(phaseIntervalRef.current);
        phaseIntervalRef.current = setInterval(() => {
          if (!mountedRef.current || connectionIdRef.current !== thisId) {
            if (phaseIntervalRef.current) clearInterval(phaseIntervalRef.current);
            return;
          }
          const elapsed =
            disconnectedAtRef.current !== null ? Date.now() - disconnectedAtRef.current : 0;
          setConnectionPhase(elapsed > 15_000 ? "lost" : "reconnecting");
        }, 250);
      }

      function stopPhaseTracking() {
        if (phaseIntervalRef.current) {
          clearInterval(phaseIntervalRef.current);
          phaseIntervalRef.current = null;
        }
        disconnectedAtRef.current = null;
      }

      sock.on("connect", () => {
        connectedRef.current = true;
        const wasDisconnected = wasDisconnectedRef.current;
        wasDisconnectedRef.current = false;
        stopPhaseTracking();
        if (mountedRef.current && connectionIdRef.current === thisId) {
          setIsConnected(true);
          setConnectionPhase("connected");
        }

        // sync:request on every connect (initial and reconnect) for gap catch-up
        // Fired regardless of wasDisconnected — initial connect also fires sync for safety
        sock.emit("sync:request", {
          lastReceivedAt: lastReceivedAtRef.current ?? undefined,
        });

        if (wasDisconnected) {
          // Additional catch-up could be done here if needed
        }
      });

      sock.on("disconnect", () => {
        connectedRef.current = false;
        wasDisconnectedRef.current = true;
        if (mountedRef.current && connectionIdRef.current === thisId) {
          setIsConnected(false);
        }
        startPhaseTracking();
      });

      // Track last received message timestamp for sync:request on reconnect
      sock.on("message:new", (payload: { createdAt?: string }) => {
        const ts = payload?.createdAt;
        if (ts) lastReceivedAtRef.current = ts;
      });

      if (mountedRef.current && connectionIdRef.current === thisId) {
        socketRef.current = sock;
        setPortalSocket(sock);
      }
    })();

    return () => {
      mountedRef.current = false;
      connectedRef.current = false;
      wasDisconnectedRef.current = false;
      if (phaseIntervalRef.current) {
        clearInterval(phaseIntervalRef.current);
        phaseIntervalRef.current = null;
      }
      // Use ref for reliable disconnect — React's functional state updater
      // is not guaranteed to run during unmount in concurrent mode.
      socketRef.current?.disconnect();
      socketRef.current = null;
      setPortalSocket(null);
      setIsConnected(false);
      setConnectionPhase("connected");
    };
  }, [status]);

  return (
    <PortalSocketContext.Provider value={{ portalSocket, isConnected, connectionPhase }}>
      {children}
    </PortalSocketContext.Provider>
  );
}
