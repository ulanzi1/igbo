// ci-allow-no-server-only — shared with standalone server
import { EventEmitter } from "node:events";
import type {
  PortalEventMap,
  PortalEventName,
  PortalAllEventMap,
  PortalAllEventName,
} from "@igbo/config/events";
import { createEventEnvelope, portalEventSchemas } from "@igbo/config/events";
import type Redis from "ioredis";

type RedisPublisherGetter = () => Redis;

class PortalTypedEventBus {
  private emitter = new EventEmitter();
  private getPublisher: RedisPublisherGetter | null = null;

  /** Inject Redis publisher lazily — called from instrumentation.ts */
  setPublisher(getter: RedisPublisherGetter): void {
    this.getPublisher = getter;
  }

  /**
   * Pre-validate an event payload WITHOUT emitting.
   * Call this BEFORE a DB transaction commits so that invalid payloads
   * cause a rollback rather than a committed-but-undelivered event.
   * Throws ZodError on invalid payload.
   */
  validate<K extends PortalEventName>(
    event: K,
    payload: Omit<PortalEventMap[K], "eventId" | "version" | "timestamp"> &
      Partial<Pick<PortalEventMap[K], "eventId" | "version" | "timestamp">>,
  ): void {
    const testPayload = {
      ...createEventEnvelope(),
      ...payload,
    } as PortalEventMap[K];
    portalEventSchemas[event].parse(testPayload);
  }

  emit<K extends PortalEventName>(
    event: K,
    payload: Omit<PortalEventMap[K], "eventId" | "version" | "timestamp"> &
      Partial<Pick<PortalEventMap[K], "eventId" | "version" | "timestamp">>,
  ): boolean {
    // Auto-inject envelope fields if caller didn't provide them
    const fullPayload = {
      ...createEventEnvelope(),
      ...payload,
    } as PortalEventMap[K];

    // Validate BEFORE Redis publish — throws ZodError if payload is invalid
    portalEventSchemas[event].parse(fullPayload);

    const result = this.emitter.emit(event, fullPayload);

    // Publish to Redis for cross-container delivery
    if (this.getPublisher) {
      try {
        const publisher = this.getPublisher();
        publisher.publish(`eventbus:${event}`, JSON.stringify(fullPayload));
      } catch {
        // Redis publish failure is non-critical — local handlers already fired
      }
    }
    return result;
  }

  on<K extends PortalAllEventName>(
    event: K,
    handler: (payload: PortalAllEventMap[K]) => void,
  ): this {
    this.emitter.on(event, handler);
    return this;
  }

  off<K extends PortalAllEventName>(
    event: K,
    handler: (payload: PortalAllEventMap[K]) => void,
  ): this {
    this.emitter.off(event, handler);
    return this;
  }

  once<K extends PortalAllEventName>(
    event: K,
    handler: (payload: PortalAllEventMap[K]) => void,
  ): this {
    this.emitter.once(event, handler);
    return this;
  }

  removeAllListeners(event?: PortalAllEventName): this {
    if (event === undefined) {
      this.emitter.removeAllListeners();
    } else {
      this.emitter.removeAllListeners(event);
    }
    return this;
  }

  listenerCount(event: PortalAllEventName): number {
    return this.emitter.listenerCount(event);
  }

  /**
   * Emit event to local handlers ONLY — does NOT publish to Redis.
   * Used exclusively by event-bridge to re-emit community events without
   * causing an infinite pub/sub loop (bridge receives from Redis → emitLocal
   * → local handlers fire → no Redis re-publish).
   *
   * Accepts PortalAllEventName (portal + community cross-app events) because
   * the bridge re-emits inbound community events (user.verified, etc.).
   */
  emitLocal<K extends PortalAllEventName>(event: K, payload: PortalAllEventMap[K]): boolean {
    return this.emitter.emit(event, payload);
  }
}

// HMR-safe singleton (same pattern as community)
const globalForEventBus = globalThis as unknown as { __portalEventBus?: PortalTypedEventBus };
export const portalEventBus = globalForEventBus.__portalEventBus ?? new PortalTypedEventBus();
if (process.env.NODE_ENV !== "production") {
  globalForEventBus.__portalEventBus = portalEventBus;
}
