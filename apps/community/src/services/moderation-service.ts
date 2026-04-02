import "server-only";
import { eventBus } from "@/services/event-bus";
import { getRedisClient } from "@/lib/redis";
import {
  getActiveKeywords,
  insertModerationAction,
  getRecentPostsForScan,
  getRecentArticlesForScan,
} from "@igbo/db/queries/moderation";
import { getPostContent } from "@igbo/db/queries/posts";
import { getArticleContent } from "@igbo/db/queries/articles";
import { scanContent } from "@/lib/moderation-scanner";
import { tiptapJsonToPlainText } from "@/features/articles/utils/tiptap-to-html";
import { getReportCountByContent } from "@igbo/db/queries/reports";
import type {
  PostPublishedEvent,
  ArticlePublishedEvent,
  MessageSentEvent,
  ReportCreatedEvent,
  KeywordAddedEvent,
} from "@/types/events";
import type { Keyword } from "@/lib/moderation-scanner";

const REDIS_KEYWORDS_KEY = "moderation:keywords:active";
const REDIS_KEYWORDS_TTL = 300; // 5 minutes

/**
 * Fetch active keywords, using Redis cache with 5-min TTL.
 * NOTE: \b word-boundary regex in scanContent is ASCII-only. After NFD normalization,
 * most Igbo combining diacritics are stripped, making the text predominantly ASCII.
 * Characters that do not NFD-decompose (e.g. ŋ U+014B) remain non-ASCII and will be
 * treated as \W by the regex engine — this means they act as word boundaries, which is
 * correct for boundary detection but may cause missed matches if a keyword spans such chars.
 * This is a known limitation of the spike; a Unicode-aware word boundary is a future epic item.
 */
async function getCachedKeywords(): Promise<Keyword[]> {
  // Try Redis cache first; fall back to direct DB if Redis is unavailable
  try {
    const redis = getRedisClient();
    const cached = await redis.get(REDIS_KEYWORDS_KEY);
    if (cached !== null) {
      // F4: Explicit reconstruction after JSON.parse (per project pattern: Epic 8 retro AI-2).
      // Values are plain strings, so reconstruction is a type-level assertion; safe for this schema.
      const parsed = JSON.parse(cached) as Array<{
        keyword: string;
        category: string;
        severity: "low" | "medium" | "high";
      }>;
      return parsed.map((k) => ({
        keyword: k.keyword,
        category: k.category,
        severity: k.severity,
      }));
    }
  } catch (err) {
    // Redis unavailable — fall through to DB direct (content must still be scanned)
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "moderation.keywords.redis_unavailable",
        error: String(err),
        note: "Falling back to direct DB query for moderation keywords",
      }),
    );
    return getActiveKeywords();
  }

  const keywords = await getActiveKeywords();
  if (keywords.length === 0) {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "moderation.keywords.empty",
        note: "No active moderation keywords found — all content will pass scan unchecked",
      }),
    );
  } else {
    console.info(
      JSON.stringify({
        level: "info",
        msg: "moderation.keywords.cache_miss",
        count: keywords.length,
      }),
    );
  }

  try {
    const redis = getRedisClient();
    await redis.set(REDIS_KEYWORDS_KEY, JSON.stringify(keywords), "EX", REDIS_KEYWORDS_TTL);
  } catch {
    // Cache write failure is non-critical — keywords fetched from DB directly next time
  }
  return keywords;
}

/**
 * Invalidate the active keywords Redis cache.
 * Called by API routes after keyword mutations (add/update/delete).
 * Non-critical: failure is swallowed.
 */
export async function invalidateKeywordCache(): Promise<void> {
  try {
    await getRedisClient().del(REDIS_KEYWORDS_KEY);
  } catch {
    // Non-critical — cache will expire naturally
  }
}

/**
 * Record a Redis failure metric (fire-and-forget).
 * F6: getRedisClient() is wrapped in try/catch — if Redis is down, this must not throw.
 */
function recordFailureMetric() {
  let redis: ReturnType<typeof getRedisClient>;
  try {
    redis = getRedisClient();
  } catch {
    return; // Redis client unavailable — metric recording silently skipped
  }
  redis.incr("moderation:failed:total").catch(() => {});
  redis.set("moderation:failed:last_error_at", new Date().toISOString()).catch(() => {});
}

export async function handlePostPublished(payload: PostPublishedEvent): Promise<void> {
  // Stage 1: fetch keywords (bail early on failure)
  let keywords: Keyword[];
  try {
    keywords = await getCachedKeywords();
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "moderation.post_published.keywords_fetch_failed",
        postId: payload.postId,
        error: String(err),
      }),
    );
    return;
  }

  const rawContent = await getPostContent(payload.postId);
  if (rawContent === null) return; // post deleted or not found

  // F5: Posts may be stored as Tiptap JSON (rich_text type) or plain text.
  // tiptapJsonToPlainText handles both: falls back to raw string if not valid JSON.
  const content = tiptapJsonToPlainText(rawContent);

  const match = scanContent(content, keywords);
  if (!match) return;

  // F8: content is guaranteed non-empty here (scanContent confirmed a match).
  // No `|| null` needed — use first 200 chars of plain-text content for preview.
  const preview = content.slice(0, 200);
  const flagReason = `Keyword match: ${match.keyword} (category: ${match.category})`;

  // Stage 2: insert flag record
  let action: { id: string } | null;
  try {
    action = await insertModerationAction({
      contentType: "post",
      contentId: payload.postId,
      contentAuthorId: payload.authorId,
      contentPreview: preview,
      flagReason,
      keywordMatched: match.keyword,
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "moderation.post_published.insert_failed",
        postId: payload.postId,
        error: String(err),
      }),
    );
    recordFailureMetric();
    return;
  }

  // F10 (known limitation): ON CONFLICT DO NOTHING means a re-published post with edited
  // content is not re-flagged if it was already flagged. The existing flag record remains
  // with the original keyword. Re-scan on edit is deferred to Epic 11 backlog.
  if (!action) return; // conflict — already flagged

  try {
    eventBus.emit("content.flagged", {
      contentType: "post",
      contentId: payload.postId,
      contentAuthorId: payload.authorId,
      contentPreview: preview,
      flagReason,
      severity: match.severity,
      moderationActionId: action.id,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "moderation.post_published.emit_failed",
        postId: payload.postId,
        error: String(err),
      }),
    );
  }
}

export async function handleArticleFlaggingCheck(payload: ArticlePublishedEvent): Promise<void> {
  // Stage 1: fetch keywords
  let keywords: Keyword[];
  try {
    keywords = await getCachedKeywords();
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "moderation.article_published.keywords_fetch_failed",
        articleId: payload.articleId,
        error: String(err),
      }),
    );
    return;
  }

  // F3: getArticleContent returns all text fields (EN + Igbo) concatenated.
  // F5: Article content is Tiptap JSON; getArticleContent returns the raw column value.
  const rawContent = await getArticleContent(payload.articleId);
  if (rawContent === null) return;

  const body = tiptapJsonToPlainText(rawContent);

  // Scan: EN title (from event payload) + EN body + Igbo body (all from getArticleContent)
  const scanText = `${payload.title} ${body}`;
  const match = scanContent(scanText, keywords);
  if (!match) return;

  // F8: Use body-only preview (not the concatenated scanText which may be title-heavy)
  const preview = body.slice(0, 200);
  const flagReason = `Keyword match: ${match.keyword} (category: ${match.category})`;

  // Stage 2: insert flag record
  let action: { id: string } | null;
  try {
    action = await insertModerationAction({
      contentType: "article",
      contentId: payload.articleId,
      contentAuthorId: payload.authorId,
      contentPreview: preview,
      flagReason,
      keywordMatched: match.keyword,
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "moderation.article_published.insert_failed",
        articleId: payload.articleId,
        error: String(err),
      }),
    );
    recordFailureMetric();
    return;
  }

  if (!action) return;

  try {
    eventBus.emit("content.flagged", {
      contentType: "article",
      contentId: payload.articleId,
      contentAuthorId: payload.authorId,
      contentPreview: preview,
      flagReason,
      severity: match.severity,
      moderationActionId: action.id,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "moderation.article_published.emit_failed",
        articleId: payload.articleId,
        error: String(err),
      }),
    );
  }
}

export async function handleMessageScanned(payload: MessageSentEvent): Promise<void> {
  // Stage 1: fetch keywords
  let keywords: Keyword[];
  try {
    keywords = await getCachedKeywords();
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "moderation.message_sent.keywords_fetch_failed",
        messageId: payload.messageId,
        error: String(err),
      }),
    );
    return;
  }

  // No DB read — message content is in the payload (plain text, not Tiptap JSON)
  const match = scanContent(payload.content, keywords);
  if (!match) return;

  const preview = payload.content.slice(0, 200);
  const flagReason = `Keyword match: ${match.keyword} (category: ${match.category})`;

  // Stage 2: insert flag record
  let action: { id: string } | null;
  try {
    action = await insertModerationAction({
      contentType: "message",
      contentId: payload.messageId,
      contentAuthorId: payload.senderId,
      contentPreview: preview,
      flagReason,
      keywordMatched: match.keyword,
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "moderation.message_sent.insert_failed",
        messageId: payload.messageId,
        error: String(err),
      }),
    );
    recordFailureMetric();
    return;
  }

  if (!action) return;

  try {
    eventBus.emit("content.flagged", {
      contentType: "message",
      contentId: payload.messageId,
      contentAuthorId: payload.senderId,
      contentPreview: preview,
      flagReason,
      severity: match.severity,
      moderationActionId: action.id,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "moderation.message_sent.emit_failed",
        messageId: payload.messageId,
        error: String(err),
      }),
    );
  }
}

/**
 * Handle report.created — ensure a moderation action entry exists for the reported content.
 * If the content is already flagged (auto-flag from Story 11.1), updates its metadata with
 * the current report count. If not yet flagged, creates a new moderation action with
 * source set to 'reported' (autoFlagged=false).
 *
 * NOTE: report_content_type includes 'comment' and 'member' which are NOT in
 * moderationContentTypeEnum. We only create/update moderation actions for types the
 * existing queue supports: 'post', 'article', 'message'.
 */
export async function handleReportCreated(payload: ReportCreatedEvent): Promise<void> {
  // Only feed queue-supported content types into moderation actions
  const QUEUE_SUPPORTED = ["post", "article", "message"] as const;
  type QueueType = (typeof QUEUE_SUPPORTED)[number];
  const isQueueSupported = (t: string): t is QueueType =>
    (QUEUE_SUPPORTED as readonly string[]).includes(t);

  if (!isQueueSupported(payload.contentType)) {
    // 'comment' and 'member' reports are stored in platform_reports but not yet surfaced
    // in the moderation queue UI — deferred to a future story.
    return;
  }

  const reportCount = await getReportCountByContent(payload.contentType, payload.contentId);

  // Fetch content preview for the moderation queue display (AC10)
  let contentPreview: string | null = null;
  try {
    if (payload.contentType === "post") {
      const raw = await getPostContent(payload.contentId);
      if (raw) contentPreview = tiptapJsonToPlainText(raw).slice(0, 200);
    } else if (payload.contentType === "article") {
      const raw = await getArticleContent(payload.contentId);
      if (raw) contentPreview = tiptapJsonToPlainText(raw).slice(0, 200);
    }
    // messages: preview not fetched (would require chat query import; low priority)
  } catch {
    // Non-critical — proceed with null preview
  }

  // Try to insert a new moderation action (will conflict if already auto-flagged)
  const flagReason = `Reported by members (${reportCount} report${reportCount === 1 ? "" : "s"})`;

  await insertModerationAction({
    contentType: payload.contentType,
    contentId: payload.contentId,
    contentAuthorId: payload.contentAuthorId,
    contentPreview,
    flagReason,
    keywordMatched: null,
    autoFlagged: false,
  });
  // ON CONFLICT DO NOTHING is fine — if already in queue, report count is surfaced via JOIN in listFlaggedContent
}

const RETROSPECTIVE_BATCH_SIZE = 100;
const RETROSPECTIVE_LOOKBACK_DAYS = 30;

/**
 * Handle moderation.keyword_added — retrospectively scan recent content for the new keyword.
 * Processes posts and articles in batches of 100, inserts moderation actions for matches.
 * Already-flagged content is excluded by the scan query (LEFT JOIN on platform_moderation_actions).
 */
export async function handleKeywordAdded(payload: KeywordAddedEvent): Promise<void> {
  const newKeyword: Keyword = {
    keyword: payload.keyword,
    category: payload.category,
    severity: payload.severity,
  };

  const since = new Date(Date.now() - RETROSPECTIVE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  let postsScanned = 0;
  let articlesScanned = 0;
  let newFlags = 0;

  // Scan posts in batches
  let offset = 0;
  while (true) {
    const posts = await getRecentPostsForScan(since, RETROSPECTIVE_BATCH_SIZE, offset);
    if (posts.length === 0) break;

    for (const post of posts) {
      postsScanned++;
      const content = tiptapJsonToPlainText(post.content);
      const match = scanContent(content, [newKeyword]);
      if (!match) continue;

      const action = await insertModerationAction({
        contentType: "post",
        contentId: post.id,
        contentAuthorId: post.authorId,
        contentPreview: content.slice(0, 200),
        flagReason: `Keyword match: ${match.keyword} (category: ${match.category})`,
        keywordMatched: match.keyword,
      });
      if (action) newFlags++;
    }

    if (posts.length < RETROSPECTIVE_BATCH_SIZE) break;
    offset += RETROSPECTIVE_BATCH_SIZE;
  }

  // Scan articles in batches
  offset = 0;
  while (true) {
    const articles = await getRecentArticlesForScan(since, RETROSPECTIVE_BATCH_SIZE, offset);
    if (articles.length === 0) break;

    for (const article of articles) {
      articlesScanned++;
      const content = tiptapJsonToPlainText(article.content);
      const match = scanContent(content, [newKeyword]);
      if (!match) continue;

      const action = await insertModerationAction({
        contentType: "article",
        contentId: article.id,
        contentAuthorId: article.authorId,
        contentPreview: content.slice(0, 200),
        flagReason: `Keyword match: ${match.keyword} (category: ${match.category})`,
        keywordMatched: match.keyword,
      });
      if (action) newFlags++;
    }

    if (articles.length < RETROSPECTIVE_BATCH_SIZE) break;
    offset += RETROSPECTIVE_BATCH_SIZE;
  }

  console.info(
    JSON.stringify({
      level: "info",
      msg: "moderation.keyword_retrospective_scan",
      keyword: payload.keyword,
      postsScanned,
      articlesScanned,
      newFlags,
    }),
  );
}

// ─── Handler Registration (HMR Guard) ─────────────────────────────────────────

const globalForModeration = globalThis as unknown as {
  __moderationHandlersRegistered?: boolean;
};

if (globalForModeration.__moderationHandlersRegistered) {
  // Handlers already registered on globalThis-persisted eventBus — skip re-registration
} else {
  // F9: Set flag AFTER all eventBus.on() calls complete to prevent partial registration
  // if an on() call throws mid-block.
  eventBus.on("post.published", async (payload: PostPublishedEvent) => {
    try {
      await handlePostPublished(payload);
    } catch (err) {
      console.error(
        JSON.stringify({
          level: "error",
          msg: "moderation.post_published.unhandled",
          error: String(err),
        }),
      );
    }
  });

  eventBus.on("article.published", async (payload: ArticlePublishedEvent) => {
    try {
      await handleArticleFlaggingCheck(payload);
    } catch (err) {
      console.error(
        JSON.stringify({
          level: "error",
          msg: "moderation.article_published.unhandled",
          error: String(err),
        }),
      );
    }
  });

  eventBus.on("message.sent", async (payload: MessageSentEvent) => {
    try {
      await handleMessageScanned(payload);
    } catch (err) {
      console.error(
        JSON.stringify({
          level: "error",
          msg: "moderation.message_sent.unhandled",
          error: String(err),
        }),
      );
    }
  });

  eventBus.on("report.created", async (payload: ReportCreatedEvent) => {
    try {
      await handleReportCreated(payload);
    } catch (err) {
      console.error(
        JSON.stringify({
          level: "error",
          msg: "moderation.report_created.unhandled",
          error: String(err),
        }),
      );
    }
  });

  eventBus.on("moderation.keyword_added", async (payload: KeywordAddedEvent) => {
    try {
      await handleKeywordAdded(payload);
    } catch (err) {
      console.error(
        JSON.stringify({
          level: "error",
          msg: "moderation.keyword_added.unhandled",
          error: String(err),
        }),
      );
    }
  });

  globalForModeration.__moderationHandlersRegistered = true;
} // end of hot-reload guard (__moderationHandlersRegistered)
