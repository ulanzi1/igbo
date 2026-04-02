// src/realtime.ts
var _a;
var REALTIME_PORT = parseInt((_a = process.env.REALTIME_PORT) != null ? _a : "3001", 10);
var _a2;
var REALTIME_CORS_ORIGIN = (_a2 = process.env.REALTIME_CORS_ORIGIN) != null ? _a2 : "http://localhost:3000";
var PRESENCE_TTL_SECONDS = 30;
var REPLAY_WINDOW_MS = 60 * 60 * 1e3;
var CHAT_REPLAY_WINDOW_MS = 24 * 60 * 60 * 1e3;
var NAMESPACE_NOTIFICATIONS = "/notifications";
var NAMESPACE_CHAT = "/chat";
var ROOM_USER = (userId) => `user:${userId}`;
var ROOM_EVENT = (eventId) => `event:${eventId}`;
var ROOM_CONVERSATION = (conversationId) => `conversation:${conversationId}`;
var ROOM_PRESENCE = (userId) => `presence:${userId}`;
var REDIS_PRESENCE_KEY = (userId) => `user:${userId}:online`;
var REDIS_TYPING_KEY = (conversationId, userId) => `typing:${conversationId}:${userId}`;
var TYPING_EXPIRE_SECONDS = 5;
var SOCKET_RATE_LIMITS = {
  // Global: max events per second per connection
  GLOBAL: { maxEvents: 60, windowMs: 1e3 },
  // Typing start: 1 per 2 seconds per conversation
  TYPING_START: { maxEvents: 1, windowMs: 2e3 },
  // Message send: 30 per minute
  MESSAGE_SEND: { maxEvents: 30, windowMs: 6e4 },
  // Reaction add: 10 per 10 seconds
  REACTION_ADD: { maxEvents: 10, windowMs: 1e4 }
};
var NOTIFICATION_FETCH_RATE_LIMIT = {
  maxRequests: 60,
  windowMs: 6e4
  // 60/min per userId
};

export {
  REALTIME_PORT,
  REALTIME_CORS_ORIGIN,
  PRESENCE_TTL_SECONDS,
  REPLAY_WINDOW_MS,
  CHAT_REPLAY_WINDOW_MS,
  NAMESPACE_NOTIFICATIONS,
  NAMESPACE_CHAT,
  ROOM_USER,
  ROOM_EVENT,
  ROOM_CONVERSATION,
  ROOM_PRESENCE,
  REDIS_PRESENCE_KEY,
  REDIS_TYPING_KEY,
  TYPING_EXPIRE_SECONDS,
  SOCKET_RATE_LIMITS,
  NOTIFICATION_FETCH_RATE_LIMIT
};
