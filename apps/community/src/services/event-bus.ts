// NOTE: No "server-only" — used by both Next.js and the standalone realtime server
import { EventEmitter } from "node:events";
import type { EventMap, EventName } from "@/types/events";
import { getRedisPublisher } from "@/lib/redis";

class TypedEventBus {
  private emitter = new EventEmitter();

  emit<K extends EventName>(event: K, payload: EventMap[K]): boolean {
    const result = this.emitter.emit(event, payload);

    // Publish to Redis for cross-container delivery
    try {
      const publisher = getRedisPublisher();
      publisher.publish(`eventbus:${event}`, JSON.stringify(payload)).catch(() => {
        // Async Redis publish failure should not break in-process event handling
      });
    } catch {
      // Sync Redis connection failure should not break in-process event handling
    }

    return result;
  }

  on<K extends EventName>(event: K, handler: (payload: EventMap[K]) => void): this {
    this.emitter.on(event, handler);
    return this;
  }

  off<K extends EventName>(event: K, handler: (payload: EventMap[K]) => void): this {
    this.emitter.off(event, handler);
    return this;
  }

  once<K extends EventName>(event: K, handler: (payload: EventMap[K]) => void): this {
    this.emitter.once(event, handler);
    return this;
  }

  removeAllListeners(event?: EventName): this {
    this.emitter.removeAllListeners(event);
    return this;
  }

  listenerCount(event: EventName): number {
    return this.emitter.listenerCount(event);
  }
}

// Use globalThis to persist the singleton across Next.js dev-mode hot reloads.
// Without this, module re-evaluation creates a new EventBus instance while
// notification handlers remain registered on the old (now-orphaned) instance.
const globalForEventBus = globalThis as unknown as { __eventBus?: TypedEventBus };
export const eventBus = (globalForEventBus.__eventBus ??= new TypedEventBus());
