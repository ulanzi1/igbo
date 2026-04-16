// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/portal-permissions", () => ({
  requireJobAdminRole: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-screening-keywords", () => ({
  getScreeningKeywordById: vi.fn(),
}));
vi.mock("@igbo/db", () => ({
  db: { transaction: vi.fn() },
}));
vi.mock("@igbo/db/schema/portal-screening-keywords", () => ({
  portalScreeningKeywords: { id: "id_col", deletedAt: "deleted_at_col" },
}));
vi.mock("@igbo/db/schema/audit-logs", () => ({
  auditLogs: {},
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ eq: [col, val] })),
  isNull: vi.fn((col: unknown) => ({ isNull: col })),
}));

import { requireJobAdminRole } from "@/lib/portal-permissions";
import { getScreeningKeywordById } from "@igbo/db/queries/portal-screening-keywords";
import { db } from "@igbo/db";
import { ApiError } from "@igbo/auth/api-error";
import { PATCH, DELETE } from "./route";
import { installMockTransaction, type MockTransactionHandle } from "@/test/mock-transaction";
import { screeningKeywordFactory } from "@/test/factories";

const adminSession = { user: { id: "admin-1", activePortalRole: "JOB_ADMIN" } };

const fakeKeyword = screeningKeywordFactory({
  id: "kw-1",
  createdByAdminId: "admin-1",
});

const BASE_URL = "https://jobs.igbo.com/api/v1/admin/screening/keywords/kw-1";

function makePatch(body: unknown) {
  return new Request(BASE_URL, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Host: "jobs.igbo.com",
      Origin: "https://jobs.igbo.com",
    },
    body: JSON.stringify(body),
  });
}

function makeDelete() {
  return new Request(BASE_URL, {
    method: "DELETE",
    headers: { Host: "jobs.igbo.com", Origin: "https://jobs.igbo.com" },
  });
}

let txHandle: MockTransactionHandle;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireJobAdminRole).mockResolvedValue(adminSession as never);
  vi.mocked(getScreeningKeywordById).mockResolvedValue(fakeKeyword as never);

  // Default transaction: update returns keyword with category overridden (for PATCH tests)
  txHandle = installMockTransaction({
    updateReturning: [{ ...fakeKeyword, category: "scam" }],
  });
});

describe("PATCH /api/v1/admin/screening/keywords/[keywordId]", () => {
  it("updates keyword and returns 200", async () => {
    const res = await PATCH(makePatch({ category: "scam" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.category).toBe("scam");
  });

  it("returns 404 when keyword not found", async () => {
    vi.mocked(getScreeningKeywordById).mockResolvedValue(null);
    const res = await PATCH(makePatch({ category: "scam" }));
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid body", async () => {
    const res = await PATCH(makePatch({ category: "invalid_category" }));
    expect(res.status).toBe(400);
  });

  it("returns 403 for non-admin", async () => {
    vi.mocked(requireJobAdminRole).mockRejectedValue(
      new ApiError({ title: "Forbidden", status: 403 }),
    );
    const res = await PATCH(makePatch({ category: "scam" }));
    expect(res.status).toBe(403);
  });

  it("writes audit log on success", async () => {
    await PATCH(makePatch({ category: "scam" }));
    expect(txHandle.inserts[0]?.values).toMatchObject({ action: "portal.blocklist.update" });
  });

  it("returns 409 on duplicate phrase (pg 23505)", async () => {
    vi.mocked(db.transaction).mockImplementationOnce(async () => {
      throw Object.assign(new Error("duplicate"), { code: "23505" });
    });
    const res = await PATCH(makePatch({ phrase: "duplicate phrase" }));
    expect(res.status).toBe(409);
  });
});

describe("DELETE /api/v1/admin/screening/keywords/[keywordId]", () => {
  it("soft-deletes keyword and returns 200", async () => {
    const res = await DELETE(makeDelete());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe("kw-1");
  });

  it("returns 404 when keyword not found", async () => {
    vi.mocked(getScreeningKeywordById).mockResolvedValue(null);
    const res = await DELETE(makeDelete());
    expect(res.status).toBe(404);
  });

  it("returns 403 for non-admin", async () => {
    vi.mocked(requireJobAdminRole).mockRejectedValue(
      new ApiError({ title: "Forbidden", status: 403 }),
    );
    const res = await DELETE(makeDelete());
    expect(res.status).toBe(403);
  });

  it("writes audit log on success", async () => {
    await DELETE(makeDelete());
    expect(txHandle.inserts[0]?.values).toMatchObject({ action: "portal.blocklist.delete" });
  });
});
