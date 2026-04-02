import "server-only";
import type { EventName } from "@/types/events";
import { getRedisSubscriber } from "@/lib/redis";
import { eventBus } from "@/services/event-bus";
import type Redis from "ioredis";

const CHANNEL_PREFIX = "eventbus:";

let subscriber: Redis | null = null;

export async function startEventBusSubscriber(): Promise<void> {
  if (subscriber) return; // Prevent duplicate pmessage handlers on double-start

  subscriber = getRedisSubscriber();

  subscriber.on("pmessage", (_pattern: string, channel: string, message: string) => {
    const eventName = channel.slice(CHANNEL_PREFIX.length) as EventName;
    try {
      const payload = JSON.parse(message);
      eventBus.emit(eventName, payload);
    } catch {
      // Malformed message — skip silently
    }
  });

  await subscriber.psubscribe(`${CHANNEL_PREFIX}*`);
}

export async function stopEventBusSubscriber(): Promise<void> {
  if (!subscriber) return;
  await subscriber.punsubscribe(`${CHANNEL_PREFIX}*`);
  subscriber = null;
}
