import "server-only";
import { eventBus } from "@/services/event-bus";
import { awardPoints } from "@/lib/points-lua-runner";
import { POINTS_CONFIG } from "@/config/points";
import { getRedisClient, getRedisPublisher } from "@/lib/redis";
import { createNotification } from "@/db/queries/notifications";
import {
  insertPointsLedgerEntry,
  getPointsRuleByActivityType,
  getUserPointsTotal,
  logPointsThrottle,
} from "@/db/queries/points";
import { getPostContentLength } from "@/db/queries/posts";
import type {
  PostReactedEvent,
  EventAttendedEvent,
  ArticlePublishedEvent,
  AccountStatusChangedEvent,
} from "@/types/events";

/** Returns badge multiplier for the earner. Story 8.3 will update when community_user_badges exists. */
export async function getBadgeMultiplier(_userId: string): Promise<number> {
  return 1;
}

/** Read points balance from Redis; fall back to DB aggregate on cache miss. */
export async function getUserPointsBalance(userId: string): Promise<number> {
  const redis = getRedisClient();
  const cached = await redis.get(`points:user:${userId}`);
  if (cached !== null) {
    const num = parseInt(cached, 10);
    if (!isNaN(num)) return num;
    // Corrupted cache value — fall through to DB
  }
  const total = await getUserPointsTotal(userId);
  await redis.set(`points:user:${userId}`, String(total)); // no TTL — Lua maintains this key
  return total;
}

export async function handlePostReacted(payload: PostReactedEvent): Promise<void> {
  // Quality gate: check content length (skip award for short or deleted posts)
  const contentLength = await getPostContentLength(payload.postId);
  if (contentLength === null) {
    console.info(
      JSON.stringify({
        level: "info",
        msg: "points.post_reacted.post_deleted_or_not_found",
        postId: payload.postId,
      }),
    );
    return;
  }
  if (contentLength < POINTS_CONFIG.QUALITY_GATE_MIN_CHARS) {
    return;
  }

  // Get earning rule
  const rule = await getPointsRuleByActivityType("like_received");
  if (!rule) return;

  // Get badge multiplier (always 1 until Story 8.3)
  const multiplier = await getBadgeMultiplier(payload.authorId);
  const amount = Math.round(rule.basePoints * multiplier);

  // Award points via Lua (atomic)
  const result = await awardPoints({
    idempotencyKey: `reaction:${payload.postId}:${payload.userId}`,
    actorId: payload.userId,
    earnerUserId: payload.authorId,
    contentOwnerId: payload.authorId,
    amount,
  });

  const [awarded, reason] = result;

  if (awarded === 1) {
    // Success — record in ledger
    await insertPointsLedgerEntry({
      userId: payload.authorId,
      points: amount,
      reason: "like_received",
      sourceType: "like_received",
      sourceId: payload.postId,
      multiplierApplied: multiplier,
    });
  } else if (reason === "rapid_fire") {
    // Throttle audit log + notify reactor
    await logPointsThrottle({
      actorId: payload.userId,
      earnerUserId: payload.authorId,
      reason: "rapid_fire",
      eventType: "post.reacted",
      eventId: payload.postId,
    });

    // Deliver throttle notification directly (not via notification-service.ts to avoid circular dep)
    try {
      const notification = await createNotification({
        userId: payload.userId, // reactor gets the toast
        type: "system",
        title: "notifications.points_throttled.title",
        body: "notifications.points_throttled.body",
        link: undefined,
      });
      const publisher = getRedisPublisher();
      await publisher.publish(
        "eventbus:notification.created",
        JSON.stringify({
          userId: payload.userId,
          notificationId: notification.id,
          type: "system",
          title: "notifications.points_throttled.title",
          body: "notifications.points_throttled.body",
          timestamp: notification.createdAt.toISOString(),
        }),
      );
    } catch {
      // Non-critical — swallow
    }
  } else if (reason === "repeat_pair") {
    // Audit log only — no user notification (admin review)
    await logPointsThrottle({
      actorId: payload.userId,
      earnerUserId: payload.authorId,
      reason: "repeat_pair",
      eventType: "post.reacted",
      eventId: payload.postId,
    });
  } else if (reason === "daily_cap") {
    // Silent skip — log only at warn level (actor ambiguous)
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "points.post_reacted.daily_cap_reached",
        earnerUserId: payload.authorId,
        postId: payload.postId,
      }),
    );
  }
  // Other reasons (duplicate, self): silent skip
}

export async function handleEventAttended(payload: EventAttendedEvent): Promise<void> {
  const rule = await getPointsRuleByActivityType("event_attended");
  if (!rule) return;

  const result = await awardPoints({
    idempotencyKey: `attended:${payload.eventId}:${payload.userId}`,
    actorId: payload.userId,
    earnerUserId: payload.hostId,
    contentOwnerId: payload.hostId,
    amount: rule.basePoints,
  });

  if (result[0] === 1) {
    await insertPointsLedgerEntry({
      userId: payload.hostId,
      points: rule.basePoints,
      reason: "event_attended",
      sourceType: "event_attended",
      sourceId: payload.eventId,
    });
  }
}

export async function handleArticlePublished(payload: ArticlePublishedEvent): Promise<void> {
  const rule = await getPointsRuleByActivityType("article_published");
  if (!rule) return;

  // Synthetic actorId — bypasses Lua self-block + prevents false rapid-fire triggers
  const result = await awardPoints({
    idempotencyKey: `article:${payload.articleId}`,
    actorId: `article:${payload.articleId}`,
    earnerUserId: payload.authorId,
    contentOwnerId: payload.authorId,
    amount: rule.basePoints,
  });

  if (result[0] === 1) {
    await insertPointsLedgerEntry({
      userId: payload.authorId,
      points: rule.basePoints,
      reason: "article_published",
      sourceType: "article_published",
      sourceId: payload.articleId,
    });
  }
}

const CLEANUP_STATUSES = ["SUSPENDED", "PENDING_DELETION", "ANONYMIZED"] as const;

export async function handleAccountStatusChanged(
  payload: AccountStatusChangedEvent,
): Promise<void> {
  if (CLEANUP_STATUSES.includes(payload.newStatus as (typeof CLEANUP_STATUSES)[number])) {
    await getRedisClient().zrem("points:leaderboard", payload.userId);
  }
}

// ─── Handler Registration (HMR Guard) ─────────────────────────────────────────

const globalForPoints = globalThis as unknown as { __pointsHandlersRegistered?: boolean };

if (globalForPoints.__pointsHandlersRegistered) {
  // Handlers already live on the globalThis-persisted eventBus — skip re-registration
} else {
  globalForPoints.__pointsHandlersRegistered = true;

  eventBus.on("post.reacted", async (payload: PostReactedEvent) => {
    try {
      await handlePostReacted(payload);
    } catch (err) {
      console.error(
        JSON.stringify({
          level: "error",
          msg: "points.post_reacted.failed",
          error: String(err),
        }),
      );
    }
  });

  eventBus.on("event.attended", async (payload: EventAttendedEvent) => {
    try {
      await handleEventAttended(payload);
    } catch (err) {
      console.error(
        JSON.stringify({
          level: "error",
          msg: "points.event_attended.failed",
          error: String(err),
        }),
      );
    }
  });

  eventBus.on("article.published", async (payload: ArticlePublishedEvent) => {
    try {
      await handleArticlePublished(payload);
    } catch (err) {
      console.error(
        JSON.stringify({
          level: "error",
          msg: "points.article_published.failed",
          error: String(err),
        }),
      );
    }
  });

  eventBus.on("account.status_changed", async (payload: AccountStatusChangedEvent) => {
    try {
      await handleAccountStatusChanged(payload);
    } catch (err) {
      console.error(
        JSON.stringify({
          level: "error",
          msg: "points.account_status_changed.failed",
          error: String(err),
        }),
      );
    }
  });
} // end of hot-reload guard (__pointsHandlersRegistered)
