/**
 * Realtime server configuration.
 * NO server-only import — rate limit constants are also used client-side for display.
 */

export const REALTIME_PORT = parseInt(process.env.REALTIME_PORT ?? "3001", 10);

export const REALTIME_CORS_ORIGIN = process.env.REALTIME_CORS_ORIGIN ?? "http://localhost:3000";

// Presence TTL in seconds — heartbeat must fire before this expires
export const PRESENCE_TTL_SECONDS = 30;

// Reconnect gap: if client's last received timestamp is within this window,
// replay missed notifications. Otherwise emit sync:full_refresh.
export const REPLAY_WINDOW_MS = 60 * 60 * 1000; // 1 hour (notifications)

// Chat replay window — longer than notifications because messages are higher-value content.
// Gap <= 24h: replay missed messages. Gap > 24h: emit sync:full_refresh.
export const CHAT_REPLAY_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

// Namespace paths
export const NAMESPACE_NOTIFICATIONS = "/notifications";
export const NAMESPACE_CHAT = "/chat";

// Room patterns
export const ROOM_USER = (userId: string) => `user:${userId}`;
export const ROOM_EVENT = (eventId: string) => `event:${eventId}`;
export const ROOM_CONVERSATION = (conversationId: string) => `conversation:${conversationId}`;

// Redis key patterns
export const REDIS_PRESENCE_KEY = (userId: string) => `user:${userId}:online`;

// Per-connection event rate limits (AC2)
export const SOCKET_RATE_LIMITS = {
  // Global: max events per second per connection
  GLOBAL: { maxEvents: 60, windowMs: 1_000 },
  // Typing start: 1 per 2 seconds per conversation
  TYPING_START: { maxEvents: 1, windowMs: 2_000 },
  // Message send: 30 per minute
  MESSAGE_SEND: { maxEvents: 30, windowMs: 60_000 },
  // Reaction add: 10 per 10 seconds
  REACTION_ADD: { maxEvents: 10, windowMs: 10_000 },
} as const satisfies Record<string, { maxEvents: number; windowMs: number }>;

// Notification REST API rate limit preset (added to RATE_LIMIT_PRESETS in services/rate-limiter.ts)
export const NOTIFICATION_FETCH_RATE_LIMIT = {
  maxRequests: 60,
  windowMs: 60_000, // 60/min per userId
};
