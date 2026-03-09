// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAdminSession = vi.fn();
const mockGetModerationActionById = vi.fn();
const mockUpdateModerationAction = vi.fn();
const mockListModerationKeywords = vi.fn();
const mockUpdateModerationKeyword = vi.fn();
const mockEventBusEmit = vi.fn();

vi.mock("@/lib/admin-auth", () => ({
  requireAdminSession: (...args: unknown[]) => mockRequireAdminSession(...args),
}));

vi.mock("@/db/queries/moderation", () => ({
  getModerationActionById: (...args: unknown[]) => mockGetModerationActionById(...args),
  updateModerationAction: (...args: unknown[]) => mockUpdateModerationAction(...args),
  listModerationKeywords: (...args: unknown[]) => mockListModerationKeywords(...args),
  updateModerationKeyword: (...args: unknown[]) => mockUpdateModerationKeyword(...args),
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

const MOCK_ITEM = {
  id: VALID_UUID,
  contentType: "post" as const,
  contentId: "post-1",
  contentPreview: "bad",
  contentAuthorId: "user-1",
  authorName: "Alice",
  flagReason: "hate_speech",
  keywordMatched: "bad",
  autoFlagged: true,
  flaggedAt: new Date(),
  status: "pending" as const,
  visibilityOverride: "visible" as const,
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
      expect.objectContaining({ action: "remove", contentType: "post" }),
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
});
