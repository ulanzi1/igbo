// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAdminSession = vi.fn();
const mockListModerationKeywords = vi.fn();
const mockAddModerationKeyword = vi.fn();

vi.mock("@igbo/auth/admin-auth", () => ({
  requireAdminSession: (...args: unknown[]) => mockRequireAdminSession(...args),
}));

vi.mock("@igbo/db/queries/moderation", () => ({
  listModerationKeywords: (...args: unknown[]) => mockListModerationKeywords(...args),
  addModerationKeyword: (...args: unknown[]) => mockAddModerationKeyword(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { GET, POST } from "./route";

const ADMIN_ID = "admin-uuid-1";

const MOCK_KW = {
  id: "kw-1",
  keyword: "badword",
  category: "hate_speech",
  severity: "high",
  notes: null,
  isActive: true,
  createdAt: new Date(),
};

function makeGetRequest(params = "") {
  return new Request(`https://example.com/api/v1/admin/moderation/keywords${params}`, {
    method: "GET",
    headers: { Host: "example.com", Origin: "https://example.com" },
  });
}

function makePostRequest(body: unknown) {
  return new Request("https://example.com/api/v1/admin/moderation/keywords", {
    method: "POST",
    headers: {
      Host: "example.com",
      Origin: "https://example.com",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdminSession.mockResolvedValue({ adminId: ADMIN_ID });
  mockListModerationKeywords.mockResolvedValue([MOCK_KW]);
  mockAddModerationKeyword.mockResolvedValue({ id: "new-kw" });
});

describe("GET /api/v1/admin/moderation/keywords", () => {
  it("returns 200 with keyword list", async () => {
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.keywords).toHaveLength(1);
  });

  it("returns 401 when unauthenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAdminSession.mockRejectedValue(new ApiError({ title: "Unauthorized", status: 401 }));
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/admin/moderation/keywords", () => {
  it("returns 201 on valid keyword", async () => {
    const res = await POST(
      makePostRequest({ keyword: "badword", category: "hate_speech", severity: "high" }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.keyword).toBeDefined();
  });

  it("returns 422 on missing required fields", async () => {
    const res = await POST(makePostRequest({ keyword: "" }));
    expect(res.status).toBe(422);
  });

  it("returns 409 on duplicate keyword", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockAddModerationKeyword.mockRejectedValue(
      new ApiError({ title: "Conflict", status: 409, detail: "Keyword already exists" }),
    );
    const res = await POST(makePostRequest({ keyword: "dup", category: "spam", severity: "low" }));
    expect(res.status).toBe(409);
  });
});
