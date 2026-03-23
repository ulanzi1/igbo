// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAdminSession = vi.fn();
const mockGetModerationActionById = vi.fn();
const mockUpdateModerationAction = vi.fn();
const mockListModerationKeywords = vi.fn();
const mockUpdateModerationKeyword = vi.fn();
const mockListMemberDisciplineHistory = vi.fn();
const mockIssueWarning = vi.fn();
const mockIssueSuspension = vi.fn();
const mockIssueBan = vi.fn();
const mockEventBusEmit = vi.fn();
const mockSoftDeletePostByModeration = vi.fn();
const mockSoftDeleteArticleByModeration = vi.fn();
const mockGetPostContentForModeration = vi.fn();
const mockGetArticleByIdForAdmin = vi.fn();
const mockTiptapJsonToPlainText = vi.fn();

vi.mock("@/lib/admin-auth", () => ({
  requireAdminSession: (...args: unknown[]) => mockRequireAdminSession(...args),
}));

vi.mock("@/db/queries/moderation", () => ({
  getModerationActionById: (...args: unknown[]) => mockGetModerationActionById(...args),
  updateModerationAction: (...args: unknown[]) => mockUpdateModerationAction(...args),
  listModerationKeywords: (...args: unknown[]) => mockListModerationKeywords(...args),
  updateModerationKeyword: (...args: unknown[]) => mockUpdateModerationKeyword(...args),
}));

vi.mock("@/db/queries/member-discipline", () => ({
  listMemberDisciplineHistory: (...args: unknown[]) => mockListMemberDisciplineHistory(...args),
}));

vi.mock("@/db/queries/posts", () => ({
  softDeletePostByModeration: (...args: unknown[]) => mockSoftDeletePostByModeration(...args),
  getPostContentForModeration: (...args: unknown[]) => mockGetPostContentForModeration(...args),
}));

vi.mock("@/db/queries/articles", () => ({
  softDeleteArticleByModeration: (...args: unknown[]) => mockSoftDeleteArticleByModeration(...args),
  getArticleByIdForAdmin: (...args: unknown[]) => mockGetArticleByIdForAdmin(...args),
}));

vi.mock("@/features/articles/utils/tiptap-to-html", () => ({
  tiptapJsonToPlainText: (...args: unknown[]) => mockTiptapJsonToPlainText(...args),
}));

vi.mock("@/services/member-discipline-service", () => ({
  issueWarning: (...args: unknown[]) => mockIssueWarning(...args),
  issueSuspension: (...args: unknown[]) => mockIssueSuspension(...args),
  issueBan: (...args: unknown[]) => mockIssueBan(...args),
}));

vi.mock("@/services/event-bus", () => ({
  eventBus: { emit: (...args: unknown[]) => mockEventBusEmit(...args) },
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { GET, PATCH } from "./route";

const ADMIN_ID = "admin-uuid-1";
const VALID_UUID = "00000000-0000-4000-8000-000000000001";

const AUTHOR_UUID = "00000000-0000-4000-8000-000000000002";

const MOCK_ITEM = {
  id: VALID_UUID,
  contentType: "post" as const,
  contentId: "post-1",
  contentPreview: "bad",
  contentAuthorId: AUTHOR_UUID,
  authorName: "Alice",
  flagReason: "hate_speech",
  keywordMatched: "bad",
  autoFlagged: true,
  flaggedAt: new Date(),
  status: "pending" as const,
  visibilityOverride: "visible" as const,
  reportCount: 0,
};

function makeRequest(method: string, body?: unknown) {
  return new Request(`https://example.com/api/v1/admin/moderation/${VALID_UUID}`, {
    method,
    headers: {
      Host: "example.com",
      Origin: "https://example.com",
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function makeInvalidRequest(method: string, body?: unknown) {
  return new Request(`https://example.com/api/v1/admin/moderation/not-a-uuid`, {
    method,
    headers: {
      Host: "example.com",
      Origin: "https://example.com",
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdminSession.mockResolvedValue({ adminId: ADMIN_ID });
  mockGetModerationActionById.mockResolvedValue(MOCK_ITEM);
  mockUpdateModerationAction.mockResolvedValue(undefined);
  mockListMemberDisciplineHistory.mockResolvedValue([]);
  mockIssueWarning.mockResolvedValue({ id: "disc-1" });
  mockIssueSuspension.mockResolvedValue({ id: "disc-2" });
  mockIssueBan.mockResolvedValue({ id: "disc-3" });
  mockSoftDeletePostByModeration.mockResolvedValue({ id: "post-1" });
  mockSoftDeleteArticleByModeration.mockResolvedValue({ id: "article-1" });
});

describe("GET /api/v1/admin/moderation/[actionId]", () => {
  it("returns 200 with action detail", async () => {
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.action).toBeDefined();
  });

  it("returns 400 for invalid UUID", async () => {
    const res = await GET(makeInvalidRequest("GET"));
    expect(res.status).toBe(400);
  });

  it("returns 403 when not admin", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAdminSession.mockRejectedValue(new ApiError({ title: "Forbidden", status: 403 }));
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(403);
  });

  it("returns 404 when action not found", async () => {
    mockGetModerationActionById.mockResolvedValue(null);
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(404);
  });

  it("returns contentBody for post content type", async () => {
    const postJson =
      '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"hello"}]}]}';
    mockGetPostContentForModeration.mockResolvedValue(postJson);
    mockTiptapJsonToPlainText.mockReturnValue("hello");

    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.contentBody).toBe("hello");
    expect(mockGetPostContentForModeration).toHaveBeenCalledWith("post-1");
    expect(mockTiptapJsonToPlainText).toHaveBeenCalledWith(postJson);
  });

  it("returns contentBody for article content type", async () => {
    const articleItem = { ...MOCK_ITEM, contentType: "article" as const, contentId: "article-1" };
    mockGetModerationActionById.mockResolvedValue(articleItem);
    mockGetArticleByIdForAdmin.mockResolvedValue({ title: "Title", contentEn: "{}" });
    mockTiptapJsonToPlainText.mockReturnValue("");

    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.contentBody).toContain("Title");
    expect(mockGetArticleByIdForAdmin).toHaveBeenCalledWith("article-1");
  });

  it("returns contentBody null when content fetch fails", async () => {
    mockGetPostContentForModeration.mockRejectedValue(new Error("DB error"));

    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.contentBody).toBeNull();
  });
});

describe("PATCH /api/v1/admin/moderation/[actionId]", () => {
  it("approve → updates status to reviewed, visibility visible", async () => {
    const updatedItem = { ...MOCK_ITEM, status: "reviewed" as const };
    mockGetModerationActionById.mockResolvedValueOnce(MOCK_ITEM).mockResolvedValueOnce(updatedItem);

    const res = await PATCH(makeRequest("PATCH", { action: "approve" }));
    expect(res.status).toBe(200);
    expect(mockUpdateModerationAction).toHaveBeenCalledWith(
      VALID_UUID,
      expect.objectContaining({ status: "reviewed", visibilityOverride: "visible" }),
    );
    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "content.moderated",
      expect.objectContaining({ action: "approve", contentType: "post" }),
    );
  });

  it("approve with whitelistKeyword deactivates the matched keyword", async () => {
    const itemWithKeyword = { ...MOCK_ITEM, keywordMatched: "bad" };
    const updatedItem = { ...itemWithKeyword, status: "reviewed" as const };
    mockGetModerationActionById
      .mockResolvedValueOnce(itemWithKeyword)
      .mockResolvedValueOnce(updatedItem);
    mockListModerationKeywords.mockResolvedValue([{ id: "kw-1", keyword: "bad", isActive: true }]);
    mockUpdateModerationKeyword.mockResolvedValue(undefined);

    const res = await PATCH(makeRequest("PATCH", { action: "approve", whitelistKeyword: true }));
    expect(res.status).toBe(200);
    expect(mockUpdateModerationKeyword).toHaveBeenCalledWith("kw-1", { isActive: false });
  });

  it("remove → updates visibility to hidden and emits content.moderated", async () => {
    const updatedItem = {
      ...MOCK_ITEM,
      status: "reviewed" as const,
      visibilityOverride: "hidden" as const,
    };
    mockGetModerationActionById.mockResolvedValueOnce(MOCK_ITEM).mockResolvedValueOnce(updatedItem);

    const res = await PATCH(makeRequest("PATCH", { action: "remove", reason: "Violation" }));
    expect(res.status).toBe(200);
    expect(mockUpdateModerationAction).toHaveBeenCalledWith(
      VALID_UUID,
      expect.objectContaining({ status: "reviewed", visibilityOverride: "hidden" }),
    );
    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "content.moderated",
      expect.objectContaining({ action: "remove", contentType: "post", contentPreview: "bad" }),
    );
  });

  it("dismiss → updates status to dismissed and emits content.moderated", async () => {
    const updatedItem = { ...MOCK_ITEM, status: "dismissed" as const };
    mockGetModerationActionById.mockResolvedValueOnce(MOCK_ITEM).mockResolvedValueOnce(updatedItem);

    const res = await PATCH(makeRequest("PATCH", { action: "dismiss" }));
    expect(res.status).toBe(200);
    expect(mockUpdateModerationAction).toHaveBeenCalledWith(
      VALID_UUID,
      expect.objectContaining({ status: "dismissed" }),
    );
    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "content.moderated",
      expect.objectContaining({ action: "dismiss", contentType: "post" }),
    );
  });

  it("returns 404 when action not found", async () => {
    mockGetModerationActionById.mockResolvedValue(null);
    const res = await PATCH(makeRequest("PATCH", { action: "approve" }));
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid UUID", async () => {
    const res = await PATCH(makeInvalidRequest("PATCH", { action: "approve" }));
    expect(res.status).toBe(400);
  });

  it("returns 403 when not admin", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAdminSession.mockRejectedValue(new ApiError({ title: "Forbidden", status: 403 }));
    const res = await PATCH(makeRequest("PATCH", { action: "approve" }));
    expect(res.status).toBe(403);
  });

  it("warn → calls issueWarning and marks action as reviewed with hidden visibility", async () => {
    const updatedItem = { ...MOCK_ITEM, status: "reviewed" as const };
    mockGetModerationActionById.mockResolvedValueOnce(MOCK_ITEM).mockResolvedValueOnce(updatedItem);

    const res = await PATCH(makeRequest("PATCH", { action: "warn", reason: "Spam content" }));
    expect(res.status).toBe(200);
    expect(mockIssueWarning).toHaveBeenCalledWith(
      expect.objectContaining({ targetUserId: AUTHOR_UUID, reason: "Spam content" }),
    );
    expect(mockUpdateModerationAction).toHaveBeenCalledWith(
      VALID_UUID,
      expect.objectContaining({ status: "reviewed", visibilityOverride: "hidden" }),
    );
  });

  it("warn → returns 422 when reason is missing", async () => {
    const res = await PATCH(makeRequest("PATCH", { action: "warn" }));
    expect(res.status).toBe(422);
    expect(mockIssueWarning).not.toHaveBeenCalled();
  });

  it("suspend → calls issueSuspension with durationHours", async () => {
    const updatedItem = { ...MOCK_ITEM, status: "reviewed" as const };
    mockGetModerationActionById.mockResolvedValueOnce(MOCK_ITEM).mockResolvedValueOnce(updatedItem);

    const res = await PATCH(
      makeRequest("PATCH", { action: "suspend", reason: "Harassment", durationHours: 24 }),
    );
    expect(res.status).toBe(200);
    expect(mockIssueSuspension).toHaveBeenCalledWith(
      expect.objectContaining({ durationHours: 24, reason: "Harassment" }),
    );
  });

  it("suspend → returns 422 for invalid duration", async () => {
    const res = await PATCH(
      makeRequest("PATCH", { action: "suspend", reason: "Harassment", durationHours: 48 }),
    );
    expect(res.status).toBe(422);
    expect(mockIssueSuspension).not.toHaveBeenCalled();
  });

  it("ban → calls issueBan when confirmed", async () => {
    const updatedItem = { ...MOCK_ITEM, status: "reviewed" as const };
    mockGetModerationActionById.mockResolvedValueOnce(MOCK_ITEM).mockResolvedValueOnce(updatedItem);

    const res = await PATCH(
      makeRequest("PATCH", { action: "ban", reason: "Severe violation", confirmed: true }),
    );
    expect(res.status).toBe(200);
    expect(mockIssueBan).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "Severe violation", targetUserId: AUTHOR_UUID }),
    );
  });

  it("ban → returns 422 when confirmed is not true", async () => {
    const res = await PATCH(makeRequest("PATCH", { action: "ban", reason: "Violation" }));
    expect(res.status).toBe(422);
    expect(mockIssueBan).not.toHaveBeenCalled();
  });

  it("remove → soft-deletes the post content", async () => {
    const updatedItem = {
      ...MOCK_ITEM,
      status: "reviewed" as const,
      visibilityOverride: "hidden" as const,
    };
    mockGetModerationActionById.mockResolvedValueOnce(MOCK_ITEM).mockResolvedValueOnce(updatedItem);

    await PATCH(makeRequest("PATCH", { action: "remove", reason: "Violation" }));
    expect(mockSoftDeletePostByModeration).toHaveBeenCalledWith("post-1");
  });

  it("remove → soft-deletes article content when contentType is article", async () => {
    const articleItem = { ...MOCK_ITEM, contentType: "article" as const, contentId: "article-1" };
    const updatedItem = {
      ...articleItem,
      status: "reviewed" as const,
      visibilityOverride: "hidden" as const,
    };
    mockGetModerationActionById
      .mockResolvedValueOnce(articleItem)
      .mockResolvedValueOnce(updatedItem);

    await PATCH(makeRequest("PATCH", { action: "remove", reason: "Violation" }));
    expect(mockSoftDeleteArticleByModeration).toHaveBeenCalledWith("article-1");
    expect(mockSoftDeletePostByModeration).not.toHaveBeenCalled();
  });

  it("warn → soft-deletes the flagged post content", async () => {
    const updatedItem = { ...MOCK_ITEM, status: "reviewed" as const };
    mockGetModerationActionById.mockResolvedValueOnce(MOCK_ITEM).mockResolvedValueOnce(updatedItem);

    await PATCH(makeRequest("PATCH", { action: "warn", reason: "Spam content" }));
    expect(mockSoftDeletePostByModeration).toHaveBeenCalledWith("post-1");
  });

  it("suspend → soft-deletes the flagged post content", async () => {
    const updatedItem = { ...MOCK_ITEM, status: "reviewed" as const };
    mockGetModerationActionById.mockResolvedValueOnce(MOCK_ITEM).mockResolvedValueOnce(updatedItem);

    await PATCH(
      makeRequest("PATCH", { action: "suspend", reason: "Harassment", durationHours: 24 }),
    );
    expect(mockSoftDeletePostByModeration).toHaveBeenCalledWith("post-1");
  });

  it("ban → soft-deletes the flagged post content", async () => {
    const updatedItem = { ...MOCK_ITEM, status: "reviewed" as const };
    mockGetModerationActionById.mockResolvedValueOnce(MOCK_ITEM).mockResolvedValueOnce(updatedItem);

    await PATCH(
      makeRequest("PATCH", { action: "ban", reason: "Severe violation", confirmed: true }),
    );
    expect(mockSoftDeletePostByModeration).toHaveBeenCalledWith("post-1");
  });

  it("approve → does NOT soft-delete content", async () => {
    const updatedItem = { ...MOCK_ITEM, status: "reviewed" as const };
    mockGetModerationActionById.mockResolvedValueOnce(MOCK_ITEM).mockResolvedValueOnce(updatedItem);

    await PATCH(makeRequest("PATCH", { action: "approve" }));
    expect(mockSoftDeletePostByModeration).not.toHaveBeenCalled();
    expect(mockSoftDeleteArticleByModeration).not.toHaveBeenCalled();
  });

  it("dismiss → does NOT soft-delete content", async () => {
    const updatedItem = { ...MOCK_ITEM, status: "dismissed" as const };
    mockGetModerationActionById.mockResolvedValueOnce(MOCK_ITEM).mockResolvedValueOnce(updatedItem);

    await PATCH(makeRequest("PATCH", { action: "dismiss" }));
    expect(mockSoftDeletePostByModeration).not.toHaveBeenCalled();
    expect(mockSoftDeleteArticleByModeration).not.toHaveBeenCalled();
  });

  // Regression: existing approve/remove/dismiss still work after extension
  it("regression: approve still works after route extension", async () => {
    const updatedItem = { ...MOCK_ITEM, status: "reviewed" as const };
    mockGetModerationActionById.mockResolvedValueOnce(MOCK_ITEM).mockResolvedValueOnce(updatedItem);

    const res = await PATCH(makeRequest("PATCH", { action: "approve" }));
    expect(res.status).toBe(200);
    expect(mockIssueWarning).not.toHaveBeenCalled();
    expect(mockIssueSuspension).not.toHaveBeenCalled();
    expect(mockIssueBan).not.toHaveBeenCalled();
  });
});
