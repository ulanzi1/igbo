/**
 * Realtime server configuration.
 * NO server-only import — rate limit constants are also used client-side for display.
 */
declare const REALTIME_PORT: number;
declare const REALTIME_CORS_ORIGIN: string;
declare const PRESENCE_TTL_SECONDS = 30;
declare const REPLAY_WINDOW_MS: number;
declare const CHAT_REPLAY_WINDOW_MS: number;
declare const NAMESPACE_NOTIFICATIONS = "/notifications";
declare const NAMESPACE_CHAT = "/chat";
declare const ROOM_USER: (userId: string) => string;
declare const ROOM_EVENT: (eventId: string) => string;
declare const ROOM_CONVERSATION: (conversationId: string) => string;
/** Room that other clients join to receive presence updates for a specific user */
declare const ROOM_PRESENCE: (userId: string) => string;
declare const REDIS_PRESENCE_KEY: (userId: string) => string;
/** Ephemeral typing state key — auto-expires after TYPING_EXPIRE_SECONDS */
declare const REDIS_TYPING_KEY: (conversationId: string, userId: string) => string;
declare const TYPING_EXPIRE_SECONDS = 5;
declare const SOCKET_RATE_LIMITS: {
  readonly GLOBAL: {
    readonly maxEvents: 60;
    readonly windowMs: 1000;
  };
  readonly TYPING_START: {
    readonly maxEvents: 1;
    readonly windowMs: 2000;
  };
  readonly MESSAGE_SEND: {
    readonly maxEvents: 30;
    readonly windowMs: 60000;
  };
  readonly REACTION_ADD: {
    readonly maxEvents: 10;
    readonly windowMs: 10000;
  };
};
declare const NOTIFICATION_FETCH_RATE_LIMIT: {
  maxRequests: number;
  windowMs: number;
};

export {
  CHAT_REPLAY_WINDOW_MS,
  NAMESPACE_CHAT,
  NAMESPACE_NOTIFICATIONS,
  NOTIFICATION_FETCH_RATE_LIMIT,
  PRESENCE_TTL_SECONDS,
  REALTIME_CORS_ORIGIN,
  REALTIME_PORT,
  REDIS_PRESENCE_KEY,
  REDIS_TYPING_KEY,
  REPLAY_WINDOW_MS,
  ROOM_CONVERSATION,
  ROOM_EVENT,
  ROOM_PRESENCE,
  ROOM_USER,
  SOCKET_RATE_LIMITS,
  TYPING_EXPIRE_SECONDS,
};
