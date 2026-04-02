// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockFilterNotificationRecipients = vi.hoisted(() => vi.fn().mockResolvedValue(["user-123"]));
vi.mock("@/services/block-service", () => ({
  filterNotificationRecipients: (...args: unknown[]) => mockFilterNotificationRecipients(...args),
}));

const mockGetConversationNotificationPreference = vi.hoisted(() =>
  vi.fn().mockResolvedValue("all"),
);
vi.mock("@/db/queries/chat-conversations", () => ({
  getConversationNotificationPreference: (...args: unknown[]) =>
    mockGetConversationNotificationPreference(...args),
}));

const mockRedisExists = vi.hoisted(() => vi.fn().mockResolvedValue(0));
const mockGetRedisClient = vi.hoisted(() => vi.fn().mockReturnValue({ exists: mockRedisExists }));
vi.mock("@/lib/redis", () => ({
  getRedisClient: () => mockGetRedisClient(),
}));

vi.mock("@/env", () => ({
  env: {
    REDIS_URL: "redis://localhost:6379",
    ENABLE_EMAIL_SENDING: false,
  },
}));

const mockGetNotificationPreferences = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock("@/db/queries/notification-preferences", () => ({
  getNotificationPreferences: (...args: unknown[]) => mockGetNotificationPreferences(...args),
  DEFAULT_PREFERENCES: {
    message: { inApp: true, email: true, push: true },
    mention: { inApp: true, email: false, push: true },
    group_activity: { inApp: true, email: false, push: false },
    event_reminder: { inApp: true, email: true, push: true },
    post_interaction: { inApp: true, email: false, push: false },
    admin_announcement: { inApp: true, email: true, push: true },
    system: { inApp: true, email: false, push: false },
  },
}));

import { NotificationRouter } from "./notification-router";

const USER_ID = "user-123";
const ACTOR_ID = "actor-456";
const CONV_ID = "conv-789";

let router: NotificationRouter;

beforeEach(() => {
  vi.clearAllMocks();
  mockFilterNotificationRecipients.mockResolvedValue([USER_ID]);
  mockGetConversationNotificationPreference.mockResolvedValue("all");
  mockRedisExists.mockResolvedValue(0);
  mockGetRedisClient.mockReturnValue({ exists: mockRedisExists });
  mockGetNotificationPreferences.mockResolvedValue({});
  router = new NotificationRouter();
});

describe("NotificationRouter", () => {
  it("1. in-app channel always delivered regardless of DnD", async () => {
    mockRedisExists.mockResolvedValue(1); // DnD active

    const result = await router.route({ userId: USER_ID, actorId: ACTOR_ID, type: "system" });

    expect(result.inApp.suppressed).toBe(false);
    expect(result.inApp.reason).toBe("in-app always delivered");
  });

  it("2. in-app channel delivered when conversation pref is 'mentions' (non-muted)", async () => {
    mockGetConversationNotificationPreference.mockResolvedValue("mentions");

    const result = await router.route({
      userId: USER_ID,
      actorId: ACTOR_ID,
      type: "mention",
      conversationId: CONV_ID,
    });

    expect(result.inApp.suppressed).toBe(false);
  });

  it("3. email channel suppressed when DnD Redis key exists (redis.exists returns 1)", async () => {
    mockRedisExists.mockResolvedValue(1); // DnD active

    const result = await router.route({
      userId: USER_ID,
      actorId: ACTOR_ID,
      type: "event_reminder",
    });

    expect(result.email.suppressed).toBe(true);
    expect(result.email.reason).toContain("quiet hours");
  });

  it("4. email channel delivered for eligible type when no DnD (event_reminder)", async () => {
    mockRedisExists.mockResolvedValue(0); // no DnD

    const result = await router.route({
      userId: USER_ID,
      actorId: ACTOR_ID,
      type: "event_reminder",
    });

    expect(result.email.suppressed).toBe(false);
    expect(result.email.reason).toContain("eligible type");
  });

  it("5. email channel suppressed for non-eligible type (system/mention/group_activity)", async () => {
    mockRedisExists.mockResolvedValue(0); // no DnD

    const result = await router.route({ userId: USER_ID, actorId: ACTOR_ID, type: "system" });

    expect(result.email.suppressed).toBe(true);
    // Story 9.4: default prefs suppress email for system (email=false default)
    expect(result.email.reason).toMatch(/user preference|allowlist/);
  });

  it("6. ALL channels suppressed when filterNotificationRecipients returns empty (blocked)", async () => {
    mockFilterNotificationRecipients.mockResolvedValue([]);

    const result = await router.route({ userId: USER_ID, actorId: ACTOR_ID, type: "system" });

    expect(result.inApp.suppressed).toBe(true);
    expect(result.email.suppressed).toBe(true);
    expect(result.push.suppressed).toBe(true);
    expect(result.inApp.reason).toBe("blocked or muted");
  });

  it("7. ALL channels suppressed when per-conversation preference is 'muted'", async () => {
    mockGetConversationNotificationPreference.mockResolvedValue("muted");

    const result = await router.route({
      userId: USER_ID,
      actorId: ACTOR_ID,
      type: "mention",
      conversationId: CONV_ID,
    });

    expect(result.inApp.suppressed).toBe(true);
    expect(result.email.suppressed).toBe(true);
    expect(result.push.suppressed).toBe(true);
    expect(result.inApp.reason).toBe("per-conversation muted");
  });

  it("8. self-notify (actorId === userId) bypasses block filter", async () => {
    mockFilterNotificationRecipients.mockResolvedValue([]); // would block if checked

    const result = await router.route({ userId: USER_ID, actorId: USER_ID, type: "system" });

    // Block filter should NOT have been called (self-notify bypass)
    expect(mockFilterNotificationRecipients).not.toHaveBeenCalled();
    // In-app should be delivered
    expect(result.inApp.suppressed).toBe(false);
  });

  it("9. push channel suppressed for non-eligible type (system)", async () => {
    mockRedisExists.mockResolvedValue(0); // no DnD

    const result = await router.route({ userId: USER_ID, actorId: ACTOR_ID, type: "system" });

    expect(result.push.suppressed).toBe(true);
    // Story 9.4: default prefs suppress push for system (push=false default)
    expect(result.push.reason).toMatch(/user preference|push allowlist/);
  });

  // ─── Story 9.3: Push channel decision ───────────────────────────────────────

  it("13. push channel delivered for eligible type + no DnD (message)", async () => {
    mockRedisExists.mockResolvedValue(0); // no DnD

    const result = await router.route({ userId: USER_ID, actorId: ACTOR_ID, type: "message" });

    expect(result.push.suppressed).toBe(false);
    expect(result.push.reason).toContain("push eligible type");
  });

  it("14. push channel suppressed when DnD active (even for eligible type)", async () => {
    mockRedisExists.mockResolvedValue(1); // DnD active

    const result = await router.route({
      userId: USER_ID,
      actorId: ACTOR_ID,
      type: "event_reminder",
    });

    expect(result.push.suppressed).toBe(true);
    expect(result.push.reason).toContain("quiet hours");
  });

  it("15. push channel suppressed for non-eligible type (group_activity)", async () => {
    mockRedisExists.mockResolvedValue(0); // no DnD

    const result = await router.route({
      userId: USER_ID,
      actorId: ACTOR_ID,
      type: "group_activity",
    });

    expect(result.push.suppressed).toBe(true);
    // Story 9.4: default prefs suppress push for group_activity (push=false default)
    expect(result.push.reason).toMatch(/user preference|push allowlist/);
  });

  it("10. RouteResult shape contains all three channel decisions", async () => {
    const result = await router.route({ userId: USER_ID, actorId: ACTOR_ID, type: "system" });

    expect(result).toHaveProperty("inApp");
    expect(result).toHaveProperty("email");
    expect(result).toHaveProperty("push");
    expect(result.inApp).toHaveProperty("suppressed");
    expect(result.inApp).toHaveProperty("reason");
    expect(result.email).toHaveProperty("suppressed");
    expect(result.email).toHaveProperty("reason");
    expect(result.push).toHaveProperty("suppressed");
    expect(result.push).toHaveProperty("reason");
  });

  // ─── Story 9.2: Updated EMAIL_ELIGIBLE_TYPES ────────────────────────────────

  it("11. 'post_interaction' type is now suppressed (removed from EMAIL_ELIGIBLE_TYPES in Story 9.2)", async () => {
    mockRedisExists.mockResolvedValue(0); // no DnD

    const result = await router.route({
      userId: USER_ID,
      actorId: ACTOR_ID,
      type: "post_interaction",
    });

    expect(result.email.suppressed).toBe(true);
    // Story 9.4: default prefs suppress email for post_interaction (email=false default)
    expect(result.email.reason).toMatch(/user preference|allowlist/);
  });

  it("12. 'message' type is now eligible for email (added to EMAIL_ELIGIBLE_TYPES in Story 9.2)", async () => {
    mockRedisExists.mockResolvedValue(0); // no DnD

    const result = await router.route({
      userId: USER_ID,
      actorId: ACTOR_ID,
      type: "message",
    });

    expect(result.email.suppressed).toBe(false);
    expect(result.email.reason).toContain("eligible type");
  });

  // ─── Story 9.4: DB preference integration ───────────────────────────────────

  it("16. email suppressed when channel_email=false in DB prefs", async () => {
    mockRedisExists.mockResolvedValue(0);
    mockGetNotificationPreferences.mockResolvedValue({
      event_reminder: {
        channelInApp: true,
        channelEmail: false,
        channelPush: true,
        digestMode: "none",
        quietHoursStart: null,
        quietHoursEnd: null,
        quietHoursTimezone: "UTC",
        lastDigestAt: null,
      },
    });

    const result = await router.route({
      userId: USER_ID,
      actorId: ACTOR_ID,
      type: "event_reminder",
    });

    expect(result.email.suppressed).toBe(true);
    expect(result.email.reason).toContain("user preference");
    expect(result.email.reason).toContain("email disabled");
  });

  it("17. push suppressed when channel_push=false in DB prefs", async () => {
    mockRedisExists.mockResolvedValue(0);
    mockGetNotificationPreferences.mockResolvedValue({
      message: {
        channelInApp: true,
        channelEmail: true,
        channelPush: false,
        digestMode: "none",
        quietHoursStart: null,
        quietHoursEnd: null,
        quietHoursTimezone: "UTC",
        lastDigestAt: null,
      },
    });

    const result = await router.route({ userId: USER_ID, actorId: ACTOR_ID, type: "message" });

    expect(result.push.suppressed).toBe(true);
    expect(result.push.reason).toContain("user preference");
    expect(result.push.reason).toContain("push disabled");
  });

  it("18. email suppressed with digest mode reason when digestMode != none", async () => {
    mockRedisExists.mockResolvedValue(0);
    mockGetNotificationPreferences.mockResolvedValue({
      event_reminder: {
        channelInApp: true,
        channelEmail: true,
        channelPush: true,
        digestMode: "daily",
        quietHoursStart: null,
        quietHoursEnd: null,
        quietHoursTimezone: "UTC",
        lastDigestAt: null,
      },
    });

    const result = await router.route({
      userId: USER_ID,
      actorId: ACTOR_ID,
      type: "event_reminder",
    });

    expect(result.email.suppressed).toBe(true);
    expect(result.email.reason).toContain("digest mode");
  });

  // ─── Story 9.5: B1 — Graceful degradation when getNotificationPreferences throws ───

  it("20. falls back to DEFAULT_PREFERENCES when getNotificationPreferences throws (B1)", async () => {
    mockGetNotificationPreferences.mockRejectedValue(new Error("DB connection refused"));
    mockFilterNotificationRecipients.mockResolvedValue([USER_ID]);
    mockRedisExists.mockResolvedValue(0);

    // Should not throw — resolves with valid RouteResult
    const result = await router.route({ userId: USER_ID, actorId: ACTOR_ID, type: "message" });

    // DEFAULT_PREFERENCES.message.inApp = true → in-app should proceed
    expect(result.inApp.suppressed).toBe(false);
    expect(result.inApp.reason).toBe("in-app always delivered");
  });

  it("21. route() does not re-throw when getNotificationPreferences throws (B1)", async () => {
    mockGetNotificationPreferences.mockRejectedValue(new Error("DB timeout"));

    // Must resolve without throwing
    await expect(
      router.route({ userId: USER_ID, actorId: ACTOR_ID, type: "event_reminder" }),
    ).resolves.not.toThrow();
  });

  it("22. email delivered with default prefs when getNotificationPreferences throws (B1)", async () => {
    mockGetNotificationPreferences.mockRejectedValue(new Error("DB down"));
    mockRedisExists.mockResolvedValue(0); // no DnD

    const result = await router.route({
      userId: USER_ID,
      actorId: ACTOR_ID,
      type: "event_reminder",
    });

    // DEFAULT_PREFERENCES.event_reminder.email = true AND event_reminder is EMAIL_ELIGIBLE
    expect(result.email.suppressed).toBe(false);
  });

  it("19. no DB row → defaults applied (email for eligible event_reminder type)", async () => {
    mockRedisExists.mockResolvedValue(0);
    mockGetNotificationPreferences.mockResolvedValue({}); // no row

    const result = await router.route({
      userId: USER_ID,
      actorId: ACTOR_ID,
      type: "event_reminder",
    });

    // Default for event_reminder: email=true → should deliver
    expect(result.email.suppressed).toBe(false);
    expect(result.email.reason).toContain("eligible type");
  });
});
