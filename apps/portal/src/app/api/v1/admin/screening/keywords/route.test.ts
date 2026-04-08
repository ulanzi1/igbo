// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/portal-permissions", () => ({
  requireJobAdminRole: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-screening-keywords", () => ({
  listScreeningKeywords: vi.fn(),
}));
vi.mock("@igbo/db", () => ({
  db: { transaction: vi.fn() },
}));
vi.mock("@igbo/db/schema/portal-screening-keywords", () => ({
  portalScreeningKeywords: {},
}));
vi.mock("@igbo/db/schema/audit-logs", () => ({
  auditLogs: {},
}));

import { requireJobAdminRole } from "@/lib/portal-permissions";
import { listScreeningKeywords } from "@igbo/db/queries/portal-screening-keywords";
import { db } from "@igbo/db";
import { ApiError } from "@igbo/auth/api-error";
import { GET, POST } from "./route";

const adminSession = { user: { id: "admin-1", activePortalRole: "JOB_ADMIN" } };

const fakeKeyword = {
  id: "kw-1",
  phrase: "must be male",
  category: "discriminatory",
  severity: "high",
  notes: null,
  createdByAdminId: "admin-1",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  deletedAt: null,
};

function makeGet(url = "https://jobs.igbo.com/api/v1/admin/screening/keywords") {
  return new Request(url, {
    method: "GET",
    headers: { Host: "jobs.igbo.com" },
  });
}

function makePost(body: unknown) {
  return new Request("https://jobs.igbo.com/api/v1/admin/screening/keywords", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Host: "jobs.igbo.com",
      Origin: "https://jobs.igbo.com",
    },
    body: JSON.stringify(body),
  });
}

const mockAuditValues = vi.fn().mockResolvedValue([]);
const mockInsertKeyword = vi.fn();

/** Build a tx stub: .insert(portalScreeningKeywords).values().returning() → [row]; .insert(auditLogs).values() */
function makeTx() {
  return {
    insert: vi.fn((table: unknown) => {
      // Route inserts portalScreeningKeywords first (with .returning()), then auditLogs (without).
      // We distinguish by call order via mockInsertKeyword for the keyword chain.
      if (mockInsertKeyword.mock.calls.length === 0) {
        mockInsertKeyword(table);
        return {
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([fakeKeyword]),
          }),
        };
      }
      return { values: mockAuditValues };
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockInsertKeyword.mockClear();
  mockAuditValues.mockClear();
  vi.mocked(requireJobAdminRole).mockResolvedValue(adminSession as never);
  vi.mocked(listScreeningKeywords).mockResolvedValue({ items: [fakeKeyword as never], total: 1 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(db.transaction).mockImplementation(async (cb: any) => {
    return cb(makeTx());
  });
});

describe("GET /api/v1/admin/screening/keywords", () => {
  it("returns keyword list for admin (200)", async () => {
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.total).toBe(1);
  });

  it("returns 403 for non-admin", async () => {
    vi.mocked(requireJobAdminRole).mockRejectedValue(
      new ApiError({ title: "Forbidden", status: 403 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid query params", async () => {
    const res = await GET(
      makeGet("https://jobs.igbo.com/api/v1/admin/screening/keywords?limit=-1"),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/admin/screening/keywords", () => {
  it("creates keyword and returns 201", async () => {
    const res = await POST(makePost({ phrase: "must be male", category: "discriminatory" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe("kw-1");
    expect(db.transaction).toHaveBeenCalled();
  });

  it("returns 400 for phrase too short", async () => {
    const res = await POST(makePost({ phrase: "x", category: "discriminatory" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid category", async () => {
    const res = await POST(makePost({ phrase: "test phrase", category: "invalid" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing body", async () => {
    const req = new Request("https://jobs.igbo.com/api/v1/admin/screening/keywords", {
      method: "POST",
      headers: { Host: "jobs.igbo.com", Origin: "https://jobs.igbo.com" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 409 for duplicate phrase (pg 23505)", async () => {
    vi.mocked(db.transaction).mockImplementationOnce(async () => {
      throw Object.assign(new Error("duplicate"), { code: "23505" });
    });
    const res = await POST(makePost({ phrase: "must be male", category: "discriminatory" }));
    expect(res.status).toBe(409);
  });

  it("returns 403 for non-admin", async () => {
    vi.mocked(requireJobAdminRole).mockRejectedValue(
      new ApiError({ title: "Forbidden", status: 403 }),
    );
    const res = await POST(makePost({ phrase: "test phrase", category: "scam" }));
    expect(res.status).toBe(403);
  });

  it("writes audit log on success", async () => {
    await POST(makePost({ phrase: "must be male", category: "discriminatory" }));
    expect(mockAuditValues).toHaveBeenCalledWith(
      expect.objectContaining({ action: "portal.blocklist.add" }),
    );
  });
});
