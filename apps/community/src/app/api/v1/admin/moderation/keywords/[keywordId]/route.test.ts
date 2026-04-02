// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAdminSession = vi.fn();
const mockUpdateModerationKeyword = vi.fn();
const mockDeleteModerationKeyword = vi.fn();

vi.mock("@/lib/admin-auth", () => ({
  requireAdminSession: (...args: unknown[]) => mockRequireAdminSession(...args),
}));

vi.mock("@igbo/db/queries/moderation", () => ({
  updateModerationKeyword: (...args: unknown[]) => mockUpdateModerationKeyword(...args),
  deleteModerationKeyword: (...args: unknown[]) => mockDeleteModerationKeyword(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { PATCH, DELETE } from "./route";

const ADMIN_ID = "admin-uuid-1";
const VALID_UUID = "00000000-0000-4000-8000-000000000001";

function makeRequest(method: string, id: string, body?: unknown) {
  return new Request(`https://example.com/api/v1/admin/moderation/keywords/${id}`, {
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
  mockUpdateModerationKeyword.mockResolvedValue(undefined);
  mockDeleteModerationKeyword.mockResolvedValue(undefined);
});

describe("PATCH /api/v1/admin/moderation/keywords/[keywordId]", () => {
  it("returns 200 and updates keyword fields", async () => {
    const res = await PATCH(makeRequest("PATCH", VALID_UUID, { isActive: false }));
    expect(res.status).toBe(200);
    expect(mockUpdateModerationKeyword).toHaveBeenCalledWith(
      VALID_UUID,
      expect.objectContaining({ isActive: false }),
    );
  });

  it("returns 400 for invalid UUID", async () => {
    const res = await PATCH(makeRequest("PATCH", "not-a-uuid", { isActive: false }));
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/v1/admin/moderation/keywords/[keywordId]", () => {
  it("returns 200 and deletes keyword", async () => {
    const res = await DELETE(makeRequest("DELETE", VALID_UUID));
    expect(res.status).toBe(200);
    expect(mockDeleteModerationKeyword).toHaveBeenCalledWith(VALID_UUID);
  });

  it("returns 400 for invalid UUID", async () => {
    const res = await DELETE(makeRequest("DELETE", "not-a-uuid"));
    expect(res.status).toBe(400);
  });
});
