// NOTE: No "server-only" import — this runs as standalone Node.js, not inside Next.js
import type { Namespace } from "socket.io";

/**
 * /chat namespace skeleton — authentication middleware already applied.
 * Full chat implementation deferred to Story 2.1.
 * Room pattern: conversation:{id}
 */
export function setupChatNamespace(ns: Namespace): void {
  ns.on("connection", () => {
    // Reserved for Story 2.1 (Epic 2: Real-Time Communication)
    // Room pattern: conversation:{conversationId}
  });
}
