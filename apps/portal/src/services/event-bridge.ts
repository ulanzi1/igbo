// NOTE: No "server-only" — may run in Next.js nodejs runtime
import type Redis from "ioredis";
import { COMMUNITY_CROSS_APP_EVENTS, createEventEnvelope } from "@igbo/config/events";
import type { CommunityCrossAppEvent, CommunityCrossAppEventMap } from "@igbo/config/events";
import { portalEventBus } from "./event-bus";

const CHANNEL_PREFIX = "eventbus:";

/** Set of valid community cross-app event names for O(1) lookup. */
const VALID_COMMUNITY_EVENTS = new Set<string>(COMMUNITY_CROSS_APP_EVENTS);

/**
 * Subscribes to community events on Redis pub/sub and re-emits
 * them into the portal's local EventBus.
 *
 * Pattern reference: apps/community/src/server/realtime/subscribers/eventbus-bridge.ts
 * This is the portal-container counterpart — instead of routing to Socket.IO namespaces,
 * we re-emit into the portal EventBus for local handler delivery.
 *
 * IMPORTANT: Uses emitLocal() — does NOT re-publish to Redis.
 * Community events arrive here via Redis and stay local.
 * Using emit() instead would cause an infinite pub/sub loop.
 */
export function startPortalEventBridge(subscriber: Redis): void {
  const channels = COMMUNITY_CROSS_APP_EVENTS.map((e) => `${CHANNEL_PREFIX}${e}`);

  void subscriber.subscribe(...(channels as [string, ...string[]])).catch((err: Error) => {
    console.error("[portal] event-bridge subscribe error:", err.message);
  });

  subscriber.on("message", (channel: string, message: string) => {
    try {
      const rawName = channel.slice(CHANNEL_PREFIX.length);
      if (!VALID_COMMUNITY_EVENTS.has(rawName)) return; // unknown event — skip

      const eventName = rawName as CommunityCrossAppEvent;
      const parsed = JSON.parse(message) as Record<string, unknown>;

      // Inject envelope fields if community event lacks them (backward compat —
      // community's BaseEvent has eventId/version as optional until migrated).
      const payload = {
        ...createEventEnvelope(),
        ...parsed,
      } as CommunityCrossAppEventMap[typeof eventName];

      console.info(
        JSON.stringify({
          level: "info",
          message: "portal.event-bridge.received",
          event: eventName,
          eventId: payload.eventId,
        }),
      );
      // Re-emit via emitLocal() to fire portal handlers WITHOUT republishing to Redis.
      // emitLocal() bypasses the Redis publish path — no infinite loop.
      portalEventBus.emitLocal(eventName, payload);
    } catch {
      // Malformed message or unrecognized event name — skip silently
    }
  });
}
