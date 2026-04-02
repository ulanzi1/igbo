// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockListPendingArticlesForAdmin = vi.fn();
const mockListPublishedArticlesForAdmin = vi.fn();

vi.mock("@/services/article-review-service", () => ({
  listPendingArticlesForAdmin: (...args: unknown[]) => mockListPendingArticlesForAdmin(...args),
  listPublishedArticlesForAdmin: (...args: unknown[]) => mockListPublishedArticlesForAdmin(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { GET } from "./route";
import { ApiError } from "@/lib/api-error";

function makeGetRequest(params: Record<string, string> = {}) {
  const url = new URL("https://localhost:3000/api/v1/admin/articles");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new Request(url.toString(), {
    headers: { Host: "localhost:3000" },
  });
}

beforeEach(() => {
  mockListPendingArticlesForAdmin.mockReset();
  mockListPublishedArticlesForAdmin.mockReset();

  mockListPendingArticlesForAdmin.mockResolvedValue({
    items: [{ id: "article-1", title: "Test", status: "pending_review" }],
    total: 1,
  });
  mockListPublishedArticlesForAdmin.mockResolvedValue({
    items: [{ id: "article-2", title: "Published", status: "published" }],
    total: 1,
  });
});

describe("GET /api/v1/admin/articles", () => {
  it("returns pending articles by default", async () => {
    const req = makeGetRequest();
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
    expect(mockListPendingArticlesForAdmin).toHaveBeenCalled();
  });

  it("returns published articles when status=published", async () => {
    const req = makeGetRequest({ status: "published" });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
    expect(mockListPublishedArticlesForAdmin).toHaveBeenCalled();
  });

  it("returns 401 when not authenticated as admin", async () => {
    mockListPendingArticlesForAdmin.mockRejectedValue(
      new ApiError({ status: 401, title: "Unauthorized" }),
    );
    const req = makeGetRequest();
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});
