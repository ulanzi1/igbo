// NOTE: No "server-only" import — this runs as standalone Node.js, not inside Next.js
import type { Server } from "socket.io";
import { NAMESPACE_PORTAL, ROOM_USER } from "@igbo/config/realtime";
import { authMiddleware } from "../middleware/auth";
import { createRateLimiterMiddleware } from "../middleware/rate-limiter";

/**
 * Sets up the /portal Socket.IO namespace.
 *
 * This is a proof-of-concept namespace for P-0.6 — validates that the auth middleware
 * works for portal sessions (portal uses the same Auth.js secret via SSO from P-0.3B).
 *
 * Full portal-specific handlers (messaging, presence, etc.) will be added in Epic 5+.
 * Prometheus metrics for this namespace are deferred to when real handlers are added.
 */
export function setupPortalNamespace(io: Server): void {
  const portalNsp = io.of(NAMESPACE_PORTAL);
  portalNsp.use(authMiddleware);
  portalNsp.use(createRateLimiterMiddleware());

  portalNsp.on("connection", (socket) => {
    const userId = socket.data.userId as string;
    socket.join(ROOM_USER(userId));
    // Portal-specific handlers + disconnect logging added in Epic 5+
  });
}
