// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAuthenticatedSession = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ userId: "user-1", role: "MEMBER" }),
);
vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: () => mockRequireAuthenticatedSession(),
}));

const mockCreateReport = vi.hoisted(() => vi.fn());
vi.mock("@/db/queries/reports", () => ({
  createReport: (...args: unknown[]) => mockCreateReport(...args),
}));

const mockEventBusEmit = vi.hoisted(() => vi.fn());
vi.mock("@/services/event-bus", () => ({
  eventBus: { emit: mockEventBusEmit },
}));

// DB mocks for content target lookup
const mockDbSelect = vi.hoisted(() => vi.fn());
vi.mock("@/db", () => ({
  db: { select: (...args: unknown[]) => mockDbSelect(...args) },
}));

vi.mock("@/db/schema/community-posts", () => ({
  communityPosts: { id: "id", authorId: "author_id", deletedAt: "deleted_at" },
}));
vi.mock("@/db/schema/post-interactions", () => ({
  communityPostComments: { id: "id", userId: "user_id" },
}));
vi.mock("@/db/schema/community-article-comments", () => ({
  communityArticleComments: { id: "id", userId: "user_id" },
}));
vi.mock("@/db/schema/community-articles", () => ({
  communityArticles: { id: "id", authorId: "author_id", deletedAt: "deleted_at" },
}));
vi.mock("@/db/schema/chat-messages", () => ({
  chatMessages: { id: "id", senderId: "sender_id" },
}));
vi.mock("@/db/schema/auth-users", () => ({
  authUsers: { id: "id", accountStatus: "account_status", deletedAt: "deleted_at" },
}));

vi.mock("@/lib/api-error", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor({ title, status }: { title: string; status: number; detail?: string }) {
      super(title);
      this.status = status;
    }
  },
}));

vi.mock("@/server/api/middleware", () => ({
  withApiHandler: (handler: (req: Request) => Promise<Response>, _opts?: unknown) => handler,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ type: "eq", a, b })),
  isNull: vi.fn((a) => ({ type: "isNull", a })),
  and: vi.fn((...args) => args.filter(Boolean)),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: { REPORT_SUBMIT: { maxRequests: 10, windowMs: 3_600_000 } },
}));

import { POST } from "./route";

function makeRequest(body: unknown, session?: { userId: string; role: string }) {
  if (session) {
    mockRequireAuthenticatedSession.mockResolvedValueOnce(session);
  }
  return new Request("http://localhost/api/v1/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Helper: mock DB to return an author for target content
function mockContentFound(authorId: string) {
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([{ authorId }]),
      }),
    }),
  });
}

// Helper: mock DB to return nothing (content not found)
function mockContentNotFound() {
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
      }),
    }),
  });
}

const VALID_BODY = {
  contentType: "post",
  contentId: "00000000-0000-4000-8000-000000000010",
  reasonCategory: "harassment",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/reports", () => {
  it("returns 401 when not authenticated", async () => {
    mockRequireAuthenticatedSession.mockRejectedValueOnce(
      Object.assign(new Error("Unauthorized"), { status: 401 }),
    );
    const req = new Request("http://localhost/api/v1/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });
    await expect(POST(req)).rejects.toMatchObject({ status: 401 });
  });

  it("throws ApiError 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/v1/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    await expect(POST(req)).rejects.toMatchObject({ status: 400 });
  });

  it("returns 400 for invalid contentType", async () => {
    const req = makeRequest({ ...VALID_BODY, contentType: "unknown" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing reasonCategory", async () => {
    const req = makeRequest({ contentType: "post", contentId: "some-id" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 404 when content target not found", async () => {
    mockContentNotFound();
    const req = makeRequest(VALID_BODY);
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("returns 400 when reporting own content", async () => {
    // authorId === reporterId → self-report
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ authorId: "user-1" }]),
        }),
      }),
    });
    const req = makeRequest(VALID_BODY);
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 201 with reportId on successful submission", async () => {
    mockContentFound("other-user");
    mockCreateReport.mockResolvedValue({
      id: "rpt-new",
      contentType: "post",
      contentId: VALID_BODY.contentId,
      reasonCategory: "harassment",
      status: "pending",
      createdAt: new Date(),
    });

    const req = makeRequest(VALID_BODY);
    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = (await res.json()) as { data: { reportId: string } };
    expect(json.data.reportId).toBe("rpt-new");
    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "report.created",
      expect.objectContaining({
        contentType: "post",
        contentId: VALID_BODY.contentId,
        contentAuthorId: "other-user",
      }),
    );
  });

  it("returns 200 with alreadyReported:true on duplicate", async () => {
    mockContentFound("other-user");
    mockCreateReport.mockResolvedValue(null); // ON CONFLICT DO NOTHING

    const req = makeRequest(VALID_BODY);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { alreadyReported: boolean } };
    expect(json.data.alreadyReported).toBe(true);
    expect(mockEventBusEmit).not.toHaveBeenCalled();
  });

  it("supports all valid reason categories", async () => {
    const categories = [
      "harassment",
      "spam",
      "inappropriate_content",
      "misinformation",
      "impersonation",
      "other",
    ];
    for (const cat of categories) {
      mockContentFound("other-user");
      mockCreateReport.mockResolvedValue({ id: "rpt-x", contentType: "post" });
      const req = makeRequest({ ...VALID_BODY, reasonCategory: cat });
      const res = await POST(req);
      expect(res.status).toBe(201);
    }
  });

  it("supports all valid content types", async () => {
    const typeToMockResult: Record<string, unknown[]> = {
      post: [{ authorId: "other-user" }],
      comment: [{ userId: "other-user" }], // communityPostComments returns userId
      article: [{ authorId: "other-user" }],
      message: [{ senderId: "other-user" }],
    };

    for (const [ct, mockResult] of Object.entries(typeToMockResult)) {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(mockResult),
          }),
        }),
      });
      mockCreateReport.mockResolvedValue({ id: "rpt-x", contentType: ct });
      const req = makeRequest({ ...VALID_BODY, contentType: ct });
      const res = await POST(req);
      expect(res.status).toBe(201);
    }
  });

  it("returns 400 for non-UUID contentId", async () => {
    const req = makeRequest({ ...VALID_BODY, contentId: "not-a-uuid" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("blocks self-report for member contentType", async () => {
    // member contentType: contentId IS the userId being reported
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: "user-1" }]),
        }),
      }),
    });
    const req = makeRequest({
      contentType: "member",
      contentId: "user-1", // same as session userId
      reasonCategory: "impersonation",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
