// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAdminSession = vi.fn();
const mockListAllDocuments = vi.fn();
const mockCreateGovernanceDocument = vi.fn();

vi.mock("@/lib/admin-auth", () => ({
  requireAdminSession: (...a: unknown[]) => mockRequireAdminSession(...a),
}));

vi.mock("@/services/governance-document-service", () => ({
  listAllDocuments: (...a: unknown[]) => mockListAllDocuments(...a),
  createGovernanceDocument: (...a: unknown[]) => mockCreateGovernanceDocument(...a),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { GET, POST } from "./route";

const sampleDoc = {
  id: "doc-1",
  title: "About Us",
  slug: "about-us",
  content: "<p>Hello</p>",
  contentIgbo: null,
  version: 1,
  status: "draft",
  visibility: "public",
};

function makeRequest(method: string, body?: unknown) {
  return new Request("https://example.com/api/v1/admin/governance-documents", {
    method,
    headers: {
      Host: "example.com",
      Origin: "https://example.com",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdminSession.mockResolvedValue({ adminId: "admin-1" });
  mockListAllDocuments.mockResolvedValue([sampleDoc]);
  mockCreateGovernanceDocument.mockResolvedValue(sampleDoc);
});

describe("GET /api/v1/admin/governance-documents", () => {
  it("returns 200 with list of documents", async () => {
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.documents).toHaveLength(1);
  });

  it("returns 403 when not admin", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAdminSession.mockRejectedValue(new ApiError({ title: "Forbidden", status: 403 }));
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/v1/admin/governance-documents", () => {
  it("creates document and returns 201", async () => {
    const res = await POST(
      makeRequest("POST", {
        title: "About Us",
        slug: "about-us",
        content: "<p>Hello</p>",
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.document.slug).toBe("about-us");
  });

  it("returns 400 for invalid slug", async () => {
    const res = await POST(
      makeRequest("POST", {
        title: "About Us",
        slug: "About Us Invalid!",
        content: "<p>Hello</p>",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing title", async () => {
    const res = await POST(makeRequest("POST", { slug: "about-us", content: "<p>Hi</p>" }));
    expect(res.status).toBe(400);
  });
});
