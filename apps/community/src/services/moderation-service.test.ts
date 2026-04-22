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
const mockGetRecentPostsForScan = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockGetRecentArticlesForScan = vi.hoisted(() => vi.fn().mockResolvedValue([]));

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

vi.mock("@igbo/db/queries/moderation", () => ({
  getActiveKeywords: (...args: unknown[]) => mockGetActiveKeywords(...args),
  insertModerationAction: (...args: unknown[]) => mockInsertModerationAction(...args),
  getRecentPostsForScan: (...args: unknown[]) => mockGetRecentPostsForScan(...args),
  getRecentArticlesForScan: (...args: unknown[]) => mockGetRecentArticlesForScan(...args),
}));

const mockGetReportCountByContent = vi.hoisted(() => vi.fn().mockResolvedValue(1));
vi.mock("@igbo/db/queries/reports", () => ({
  getReportCountByContent: (...args: unknown[]) => mockGetReportCountByContent(...args),
}));

vi.mock("@igbo/db/queries/posts", () => ({
  getPostContent: (...args: unknown[]) => mockGetPostContent(...args),
  getPostContentLength: vi.fn(),
  getPostAuthorId: vi.fn(),
  getPostGroupId: vi.fn(),
}));

vi.mock("@igbo/db/queries/articles", () => ({
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
  handleReportCreated,
  handleKeywordAdded,
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
    expect(handlerRef.current.has("chat.message.sent")).toBe(true);
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

describe("handleReportCreated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls insertModerationAction for queue-supported content types", async () => {
    mockGetReportCountByContent.mockResolvedValue(2);
    mockInsertModerationAction.mockResolvedValue(null); // ON CONFLICT DO NOTHING
    mockGetPostContent.mockResolvedValue("This is reported post content");

    await handleReportCreated({
      reportId: "rpt-1",
      contentType: "post",
      contentId: "post-1",
      reasonCategory: "harassment",
      contentAuthorId: "author-abc",
      timestamp: new Date().toISOString(),
    });

    expect(mockGetReportCountByContent).toHaveBeenCalledWith("post", "post-1");
    expect(mockGetPostContent).toHaveBeenCalledWith("post-1");
    expect(mockInsertModerationAction).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: "post",
        contentId: "post-1",
        contentAuthorId: "author-abc",
        contentPreview: "This is reported post content",
        autoFlagged: false,
      }),
    );
  });

  it("fetches article content preview for reported articles", async () => {
    mockGetReportCountByContent.mockResolvedValue(1);
    mockInsertModerationAction.mockResolvedValue(null);
    mockGetArticleContent.mockResolvedValue("Article body text here");

    await handleReportCreated({
      reportId: "rpt-art-1",
      contentType: "article",
      contentId: "art-1",
      reasonCategory: "misinformation",
      contentAuthorId: "author-art",
      timestamp: new Date().toISOString(),
    });

    expect(mockGetArticleContent).toHaveBeenCalledWith("art-1");
    expect(mockInsertModerationAction).toHaveBeenCalledWith(
      expect.objectContaining({
        contentPreview: "Article body text here",
      }),
    );
  });

  it("falls back to null preview when content fetch fails", async () => {
    mockGetReportCountByContent.mockResolvedValue(1);
    mockInsertModerationAction.mockResolvedValue(null);
    mockGetPostContent.mockRejectedValue(new Error("DB error"));

    await handleReportCreated({
      reportId: "rpt-err",
      contentType: "post",
      contentId: "post-err",
      reasonCategory: "spam",
      contentAuthorId: "author-err",
      timestamp: new Date().toISOString(),
    });

    expect(mockInsertModerationAction).toHaveBeenCalledWith(
      expect.objectContaining({
        contentPreview: null,
      }),
    );
  });

  it("skips insertModerationAction for non-queue content types (comment, member)", async () => {
    await handleReportCreated({
      reportId: "rpt-2",
      contentType: "comment",
      contentId: "cmt-1",
      reasonCategory: "spam",
      contentAuthorId: "author-xyz",
      timestamp: new Date().toISOString(),
    });

    expect(mockInsertModerationAction).not.toHaveBeenCalled();

    await handleReportCreated({
      reportId: "rpt-3",
      contentType: "member",
      contentId: "user-1",
      reasonCategory: "impersonation",
      contentAuthorId: "user-1",
      timestamp: new Date().toISOString(),
    });

    expect(mockInsertModerationAction).not.toHaveBeenCalled();
  });

  it("includes report count in flagReason", async () => {
    mockGetReportCountByContent.mockResolvedValue(5);
    mockInsertModerationAction.mockResolvedValue(null);

    await handleReportCreated({
      reportId: "rpt-4",
      contentType: "article",
      contentId: "art-1",
      reasonCategory: "misinformation",
      contentAuthorId: "author-art",
      timestamp: new Date().toISOString(),
    });

    expect(mockInsertModerationAction).toHaveBeenCalledWith(
      expect.objectContaining({
        flagReason: expect.stringContaining("5 reports"),
      }),
    );
  });
});

// ─── Task 11: Retrospective keyword scan ──────────────────────────────────────

const KEYWORD_ADDED_PAYLOAD = {
  keyword: "badword",
  severity: "high" as const,
  category: "hate_speech",
  createdBy: "admin-1",
  timestamp: new Date().toISOString(),
};

describe("handleKeywordAdded", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertModerationAction.mockResolvedValue({ id: "action-new" });
    mockGetRecentPostsForScan.mockResolvedValue([]);
    mockGetRecentArticlesForScan.mockResolvedValue([]);
  });

  it("registers handler for moderation.keyword_added", () => {
    expect(handlerRef.current.has("moderation.keyword_added")).toBe(true);
  });

  it("scans recent posts and flags matching content", async () => {
    mockGetRecentPostsForScan
      .mockResolvedValueOnce([
        { id: "post-1", authorId: "author-a", content: "This has badword in it" },
      ])
      .mockResolvedValue([]);

    await handleKeywordAdded(KEYWORD_ADDED_PAYLOAD);

    expect(mockInsertModerationAction).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: "post",
        contentId: "post-1",
        contentAuthorId: "author-a",
        keywordMatched: "badword",
      }),
    );
  });

  it("scans recent articles and flags matching content", async () => {
    mockGetRecentArticlesForScan
      .mockResolvedValueOnce([
        { id: "article-1", authorId: "author-b", content: "Article mentioning badword" },
      ])
      .mockResolvedValue([]);

    await handleKeywordAdded(KEYWORD_ADDED_PAYLOAD);

    expect(mockInsertModerationAction).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: "article",
        contentId: "article-1",
        keywordMatched: "badword",
      }),
    );
  });

  it("paginates through multiple batches when >100 items exist", async () => {
    // First batch: 100 posts (simulate full batch), second batch: empty (end)
    const batch1 = Array.from({ length: 100 }, (_, i) => ({
      id: `post-batch-${i}`,
      authorId: `author-${i}`,
      content: i === 50 ? "This has badword here" : "Clean content",
    }));
    mockGetRecentPostsForScan.mockResolvedValueOnce(batch1).mockResolvedValueOnce([]); // end of posts

    await handleKeywordAdded(KEYWORD_ADDED_PAYLOAD);

    // Should have been called twice for posts (batch 1 + empty batch 2)
    expect(mockGetRecentPostsForScan).toHaveBeenCalledTimes(2);
    // Only the matching post should be flagged
    expect(mockInsertModerationAction).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: "post",
        contentId: "post-batch-50",
        keywordMatched: "badword",
      }),
    );
  });

  it("does not call insertModerationAction when no content matches the keyword", async () => {
    mockGetRecentPostsForScan
      .mockResolvedValueOnce([
        { id: "post-2", authorId: "author-c", content: "Clean content here" },
      ])
      .mockResolvedValue([]);

    await handleKeywordAdded(KEYWORD_ADDED_PAYLOAD);

    expect(mockInsertModerationAction).not.toHaveBeenCalled();
  });
});
