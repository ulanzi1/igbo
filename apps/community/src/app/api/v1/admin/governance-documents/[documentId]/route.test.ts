// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAdminSession = vi.fn();
const mockGetDocumentById = vi.fn();
const mockUpdateGovernanceDocument = vi.fn();
const mockPublishGovernanceDocument = vi.fn();

vi.mock("@igbo/auth/admin-auth", () => ({
  requireAdminSession: (...a: unknown[]) => mockRequireAdminSession(...a),
}));

vi.mock("@/services/governance-document-service", () => ({
  getDocumentById: (...a: unknown[]) => mockGetDocumentById(...a),
  updateGovernanceDocument: (...a: unknown[]) => mockUpdateGovernanceDocument(...a),
  publishGovernanceDocument: (...a: unknown[]) => mockPublishGovernanceDocument(...a),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { GET, PATCH, POST } from "./route";

const sampleDoc = {
  id: "doc-1",
  title: "About Us",
  slug: "about-us",
  content: "<p>Hello</p>",
  contentIgbo: null,
  version: 2,
  status: "published",
  visibility: "public",
};

function makeRequest(method: string, id = "doc-1", body?: unknown) {
  return new Request(`https://example.com/api/v1/admin/governance-documents/${id}`, {
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
  mockGetDocumentById.mockResolvedValue(sampleDoc);
  mockUpdateGovernanceDocument.mockResolvedValue(sampleDoc);
  mockPublishGovernanceDocument.mockResolvedValue(sampleDoc);
});

describe("GET /api/v1/admin/governance-documents/[documentId]", () => {
  it("returns document", async () => {
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.document.slug).toBe("about-us");
  });

  it("returns 404 when not found", async () => {
    mockGetDocumentById.mockResolvedValue(null);
    const res = await GET(makeRequest("GET", "missing"));
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/v1/admin/governance-documents/[documentId]", () => {
  it("updates document", async () => {
    const res = await PATCH(makeRequest("PATCH", "doc-1", { title: "New Title" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.document).toBeDefined();
  });

  it("returns 404 when document not found", async () => {
    mockUpdateGovernanceDocument.mockResolvedValue(null);
    const res = await PATCH(makeRequest("PATCH", "missing", { title: "X" }));
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid body", async () => {
    const res = await PATCH(makeRequest("PATCH", "doc-1", { visibility: "invalid_value" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/admin/governance-documents/[documentId] (publish)", () => {
  it("publishes document", async () => {
    const res = await POST(makeRequest("POST"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.document.status).toBe("published");
  });

  it("returns 404 when document not found", async () => {
    mockPublishGovernanceDocument.mockResolvedValue(null);
    const res = await POST(makeRequest("POST", "missing"));
    expect(res.status).toBe(404);
  });
});
