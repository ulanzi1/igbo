// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockGetExportRequestByToken = vi.fn();

vi.mock("@igbo/db/queries/gdpr", () => ({
  getExportRequestByToken: (...args: unknown[]) => mockGetExportRequestByToken(...args),
  createExportRequest: vi.fn(),
  getUserExportRequests: vi.fn(),
  updateExportRequest: vi.fn(),
  findAccountsPendingAnonymization: vi.fn(),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { GET } from "./route";

const VALID_TOKEN = "a".repeat(64);
const EXPORT_DATA = { profile: { name: "Test" }, posts: [] };

function makeGetRequest(token: string) {
  return new Request(`https://example.com/api/v1/user/account/export/download/${token}`, {
    method: "GET",
    headers: {
      Host: "example.com",
      Origin: "https://example.com",
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/user/account/export/download/[token]", () => {
  it("returns 200 with JSON payload and Content-Disposition header for valid token", async () => {
    mockGetExportRequestByToken.mockResolvedValue({
      id: "req-1",
      status: "ready",
      downloadToken: VALID_TOKEN,
      exportData: EXPORT_DATA,
      expiresAt: new Date(Date.now() + 86400000), // 1 day from now
    });

    const req = makeGetRequest(VALID_TOKEN);
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="my-data-export.json"',
    );
    const body = await res.json();
    expect(body).toMatchObject(EXPORT_DATA);
  });

  it("returns 404 for unknown token", async () => {
    mockGetExportRequestByToken.mockResolvedValue(null);
    const req = makeGetRequest("unknowntoken");
    const res = await GET(req);
    expect(res.status).toBe(404);
  });

  it("returns 410 Gone for expired token (status = expired)", async () => {
    mockGetExportRequestByToken.mockResolvedValue({
      id: "req-2",
      status: "expired",
      downloadToken: VALID_TOKEN,
      exportData: EXPORT_DATA,
      expiresAt: new Date(Date.now() - 1000),
    });
    const req = makeGetRequest(VALID_TOKEN);
    const res = await GET(req);
    expect(res.status).toBe(410);
  });

  it("returns 410 Gone when expiresAt is in the past", async () => {
    mockGetExportRequestByToken.mockResolvedValue({
      id: "req-3",
      status: "ready",
      downloadToken: VALID_TOKEN,
      exportData: EXPORT_DATA,
      expiresAt: new Date(Date.now() - 1000), // expired
    });
    const req = makeGetRequest(VALID_TOKEN);
    const res = await GET(req);
    expect(res.status).toBe(410);
  });
});
