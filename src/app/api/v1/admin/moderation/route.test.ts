// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAdminSession = vi.fn();
const mockListFlaggedContent = vi.fn();

vi.mock("@/lib/admin-auth", () => ({
  requireAdminSession: (...args: unknown[]) => mockRequireAdminSession(...args),
}));

vi.mock("@/db/queries/moderation", () => ({
  listFlaggedContent: (...args: unknown[]) => mockListFlaggedContent(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { GET } from "./route";

const ADMIN_ID = "admin-uuid-1";

function makeGetRequest(params = "") {
  return new Request(`https://example.com/api/v1/admin/moderation${params}`, {
    method: "GET",
    headers: { Host: "example.com", Origin: "https://example.com" },
  });
}

const MOCK_ITEMS = [
  {
    id: "action-1",
    contentType: "post",
    contentId: "post-1",
    contentPreview: "bad",
    contentAuthorId: "user-1",
    authorName: "Alice",
    flagReason: "hate_speech",
    keywordMatched: "bad",
    autoFlagged: true,
    flaggedAt: new Date(),
    status: "pending",
    visibilityOverride: "visible",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdminSession.mockResolvedValue({ adminId: ADMIN_ID });
  mockListFlaggedContent.mockResolvedValue({ items: MOCK_ITEMS, total: 1 });
});

describe("GET /api/v1/admin/moderation", () => {
  it("returns 200 with items and meta on success", async () => {
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.meta).toMatchObject({ page: 1, pageSize: 20, total: 1 });
  });

  it("returns 401 when unauthenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAdminSession.mockRejectedValue(new ApiError({ title: "Unauthorized", status: 401 }));
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 when not admin", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAdminSession.mockRejectedValue(new ApiError({ title: "Forbidden", status: 403 }));
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(403);
  });

  it("passes status filter to query", async () => {
    await GET(makeGetRequest("?status=reviewed"));
    expect(mockListFlaggedContent).toHaveBeenCalledWith(
      expect.objectContaining({ status: "reviewed" }),
    );
  });

  it("passes contentType filter to query", async () => {
    await GET(makeGetRequest("?contentType=message"));
    expect(mockListFlaggedContent).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "message" }),
    );
  });
});
