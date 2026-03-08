// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
const { handlerRef, mockEventBusOn, mockEventBusEmit } = vi.hoisted(() => {
  const handlers = new Map<string, (payload: unknown) => Promise<void>>();
  const mockOn = vi.fn((event: string, handler: (payload: unknown) => Promise<void>) => {
    handlers.set(event, handler);
  });
  const mockEmit = vi.fn();
  return { handlerRef: { current: handlers }, mockEventBusOn: mockOn, mockEventBusEmit: mockEmit };
});

const mockGetActiveKeywords = vi.hoisted(() => vi.fn());
const mockInsertModerationAction = vi.hoisted(() => vi.fn());
const mockGetPostContent = vi.hoisted(() => vi.fn());
const mockGetArticleContent = vi.hoisted(() => vi.fn());

const mockRedisGet = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const mockRedisSet = vi.hoisted(() => vi.fn().mockResolvedValue("OK"));
const mockRedisIncr = vi.hoisted(() => vi.fn().mockResolvedValue(1));
const mockGetRedisClient = vi.hoisted(() =>
  vi.fn().mockReturnValue({
    get: (...args: unknown[]) => mockRedisGet(...args),
    set: (...args: unknown[]) => mockRedisSet(...args),
    incr: (...args: unknown[]) => mockRedisIncr(...args),
  }),
);

vi.mock("@/services/event-bus", () => ({
  eventBus: { on: mockEventBusOn, emit: mockEventBusEmit },
}));

vi.mock("@/db/queries/moderation", () => ({
  getActiveKeywords: (...args: unknown[]) => mockGetActiveKeywords(...args),
  insertModerationAction: (...args: unknown[]) => mockInsertModerationAction(...args),
}));

vi.mock("@/db/queries/posts", () => ({
  getPostContent: (...args: unknown[]) => mockGetPostContent(...args),
  getPostContentLength: vi.fn(),
  getPostAuthorId: vi.fn(),
  getPostGroupId: vi.fn(),
}));

vi.mock("@/db/queries/articles", () => ({
  getArticleContent: (...args: unknown[]) => mockGetArticleContent(...args),
}));

vi.mock("@/lib/redis", () => ({
  getRedisClient: () => mockGetRedisClient(),
}));

// tiptapJsonToPlainText: use real implementation (pure function, no deps)
// — but mock the module so tests that pass plain text strings still work
vi.mock("@/features/articles/utils/tiptap-to-html", () => ({
  tiptapJsonToPlainText: (s: string) => {
    // Simplified: return as-is (test content is plain text, not Tiptap JSON)
    try {
      const parsed = JSON.parse(s) as { type?: string };
      if (typeof parsed?.type === "string") {
        // It's a tiptap doc — extract text naively for test purposes
        return JSON.stringify(parsed).replace(/"text":"([^"]+)"/g, "$1");
      }
    } catch {
      // not JSON
    }
    return s;
  },
  tiptapJsonToHtml: (s: string) => s,
}));

// Import after mocks — module-level HMR guard runs at import time
import {
  handlePostPublished,
  handleArticleFlaggingCheck,
  handleMessageScanned,
} from "./moderation-service";

const KEYWORDS = [
  { keyword: "badword", category: "hate_speech", severity: "high" as const },
  { keyword: "spam", category: "spam", severity: "low" as const },
];

const POST_PAYLOAD = {
  postId: "post-123",
  authorId: "author-456",
  timestamp: new Date().toISOString(),
};

const ARTICLE_PAYLOAD = {
  articleId: "article-789",
  authorId: "author-456",
  title: "Clean title",
  slug: "clean-title",
  timestamp: new Date().toISOString(),
};

const MESSAGE_PAYLOAD = {
  messageId: "msg-001",
  senderId: "sender-111",
  conversationId: "conv-222",
  content: "Hello badword world",
  contentType: "text",
  createdAt: new Date().toISOString(),
  timestamp: new Date().toISOString(),
};

describe("ModerationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset Redis cache miss by default
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue("OK");
    mockRedisIncr.mockResolvedValue(1);
    mockGetActiveKeywords.mockResolvedValue(KEYWORDS);
    mockInsertModerationAction.mockResolvedValue({ id: "action-id-1" });
    mockGetPostContent.mockResolvedValue(null);
    mockGetArticleContent.mockResolvedValue(null);
  });

  // ─── HMR Guard ──────────────────────────────────────────────────────────────

  it("registers exactly one handler each for post.published, article.published, and message.sent", () => {
    // Handlers are captured in handlerRef.current at module import time
    // Handlers are captured in handlerRef.current at module import time (before beforeEach clears mocks)
    expect(handlerRef.current.has("post.published")).toBe(true);
    expect(handlerRef.current.has("article.published")).toBe(true);
    expect(handlerRef.current.has("message.sent")).toBe(true);
  });

  // ─── handlePostPublished ────────────────────────────────────────────────────

  it("does not call insertModerationAction when post is not found (getPostContent returns null)", async () => {
    mockGetPostContent.mockResolvedValue(null);
    await handlePostPublished(POST_PAYLOAD);
    expect(mockInsertModerationAction).not.toHaveBeenCalled();
  });

  it("does not call insertModerationAction when no keyword matches post content", async () => {
    mockGetPostContent.mockResolvedValue("This is completely clean content");
    await handlePostPublished(POST_PAYLOAD);
    expect(mockInsertModerationAction).not.toHaveBeenCalled();
    expect(mockEventBusEmit).not.toHaveBeenCalled();
  });

  it("calls insertModerationAction with correct params and emits content.flagged on keyword match", async () => {
    mockGetPostContent.mockResolvedValue("This post contains badword which is flagged");
    await handlePostPublished(POST_PAYLOAD);

    expect(mockInsertModerationAction).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: "post",
        contentId: "post-123",
        contentAuthorId: "author-456",
        keywordMatched: "badword",
      }),
    );

    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "content.flagged",
      expect.objectContaining({
        contentType: "post",
        contentId: "post-123",
        contentAuthorId: "author-456",
        severity: "high",
        moderationActionId: "action-id-1",
      }),
    );
  });

  it("does not insert or emit when getActiveKeywords throws", async () => {
    mockGetActiveKeywords.mockRejectedValue(new Error("DB error"));
    mockGetPostContent.mockResolvedValue("post with badword");
    await handlePostPublished(POST_PAYLOAD); // must not throw
    expect(mockInsertModerationAction).not.toHaveBeenCalled();
    expect(mockEventBusEmit).not.toHaveBeenCalled();
  });

  it("does not emit content.flagged when insertModerationAction returns null (conflict)", async () => {
    mockGetPostContent.mockResolvedValue("post with badword here");
    mockInsertModerationAction.mockResolvedValue(null); // conflict
    await handlePostPublished(POST_PAYLOAD);
    expect(mockEventBusEmit).not.toHaveBeenCalled();
  });

  it("records failure metrics and does not propagate when insertModerationAction throws", async () => {
    mockGetPostContent.mockResolvedValue("post with badword here");
    mockInsertModerationAction.mockRejectedValue(new Error("DB write failed"));
    await handlePostPublished(POST_PAYLOAD); // must not throw
    expect(mockRedisIncr).toHaveBeenCalledWith("moderation:failed:total");
    expect(mockRedisSet).toHaveBeenCalledWith(
      "moderation:failed:last_error_at",
      expect.any(String),
    );
    expect(mockEventBusEmit).not.toHaveBeenCalled();
  });

  // ─── handleArticleFlaggingCheck ─────────────────────────────────────────────

  it("inserts flag with content_type=article when article content matches keyword", async () => {
    mockGetArticleContent.mockResolvedValue("This article has badword in it");
    await handleArticleFlaggingCheck(ARTICLE_PAYLOAD);

    expect(mockInsertModerationAction).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: "article",
        contentId: "article-789",
        contentAuthorId: "author-456",
        keywordMatched: "badword",
      }),
    );
  });

  it("scans article title + body concatenated", async () => {
    // badword is in title, body is clean
    const titlePayload = { ...ARTICLE_PAYLOAD, title: "Article about badword" };
    mockGetArticleContent.mockResolvedValue("Clean body with no matches");
    await handleArticleFlaggingCheck(titlePayload);
    expect(mockInsertModerationAction).toHaveBeenCalled();
  });

  // ─── handleMessageScanned ────────────────────────────────────────────────────

  it("inserts flag with content_type=message when message content matches, without calling getPostContent", async () => {
    await handleMessageScanned(MESSAGE_PAYLOAD);

    expect(mockGetPostContent).not.toHaveBeenCalled();
    expect(mockInsertModerationAction).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: "message",
        contentId: "msg-001",
        contentAuthorId: "sender-111",
        keywordMatched: "badword",
      }),
    );
  });

  it("does not call insertModerationAction when message has no keyword match", async () => {
    const cleanPayload = { ...MESSAGE_PAYLOAD, content: "Hello everyone, good morning!" };
    await handleMessageScanned(cleanPayload);
    expect(mockInsertModerationAction).not.toHaveBeenCalled();
    expect(mockEventBusEmit).not.toHaveBeenCalled();
  });

  // ─── Redis cache ─────────────────────────────────────────────────────────────

  it("uses cached keywords from Redis on second call (does not call getActiveKeywords again)", async () => {
    mockGetPostContent.mockResolvedValue("clean content");
    // First call: cache miss → loads from DB, stores in Redis
    mockRedisGet.mockResolvedValueOnce(null);
    await handlePostPublished(POST_PAYLOAD);
    expect(mockGetActiveKeywords).toHaveBeenCalledTimes(1);

    // Second call: cache hit → returns JSON from Redis directly
    mockRedisGet.mockResolvedValueOnce(JSON.stringify(KEYWORDS));
    await handlePostPublished(POST_PAYLOAD);
    expect(mockGetActiveKeywords).toHaveBeenCalledTimes(1); // still 1
  });
});
