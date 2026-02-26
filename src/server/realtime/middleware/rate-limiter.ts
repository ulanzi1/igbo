import type { Socket } from "socket.io";
import { SOCKET_RATE_LIMITS } from "@/config/realtime";

interface RateLimitWindow {
  count: number;
  resetAt: number;
}

/**
 * Per-connection fixed-window rate limiter stored in socket.data.
 */
function checkLimit(socket: Socket, key: string, maxEvents: number, windowMs: number): boolean {
  const now = Date.now();
  const limits = (socket.data.rateLimits ?? {}) as Record<string, RateLimitWindow>;

  const window = limits[key];
  if (!window || now >= window.resetAt) {
    limits[key] = { count: 1, resetAt: now + windowMs };
    socket.data.rateLimits = limits;
    return true;
  }

  if (window.count >= maxEvents) {
    return false;
  }

  window.count += 1;
  return true;
}

/**
 * Returns a Socket.IO connection middleware that attaches a per-event
 * packet middleware via socket.use() to enforce rate limiting.
 *
 * socket.use() intercepts every incoming packet BEFORE it reaches
 * registered event handlers, allowing us to block events by calling
 * next(new Error(...)).
 */
export function createRateLimiterMiddleware() {
  return (socket: Socket, next: (err?: Error) => void): void => {
    // Initialize per-socket rate limit storage
    socket.data.rateLimits = {};

    // Register packet-level middleware that can block events
    socket.use((packet, packetNext) => {
      const eventName = packet[0] as string;

      // Global rate limit
      if (
        !checkLimit(
          socket,
          "__global__",
          SOCKET_RATE_LIMITS.GLOBAL.maxEvents,
          SOCKET_RATE_LIMITS.GLOBAL.windowMs,
        )
      ) {
        socket.emit("rate_limit:exceeded", {
          event: eventName,
          reason: "global",
          timestamp: new Date().toISOString(),
        });
        packetNext(new Error("rate_limit:exceeded"));
        return;
      }

      // Per-event-type limits
      let limitKey: string | null = null;
      let preset: { maxEvents: number; windowMs: number } | null = null;

      if (eventName === "typing:start") {
        limitKey = "typing:start";
        preset = SOCKET_RATE_LIMITS.TYPING_START;
      } else if (eventName === "message:send") {
        limitKey = "message:send";
        preset = SOCKET_RATE_LIMITS.MESSAGE_SEND;
      } else if (eventName === "reaction:add") {
        limitKey = "reaction:add";
        preset = SOCKET_RATE_LIMITS.REACTION_ADD;
      }

      if (limitKey && preset && !checkLimit(socket, limitKey, preset.maxEvents, preset.windowMs)) {
        socket.emit("rate_limit:exceeded", {
          event: eventName,
          reason: limitKey,
          timestamp: new Date().toISOString(),
        });
        packetNext(new Error("rate_limit:exceeded"));
        return;
      }

      packetNext();
    });

    next();
  };
}
