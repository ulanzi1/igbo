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
    expect(result.email.reason).toContain("allowlist");
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
    expect(result.push.reason).toBe("type not in push allowlist");
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
    expect(result.push.reason).toBe("type not in push allowlist");
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
    expect(result.email.reason).toContain("allowlist");
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
});
