// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockAuth = vi.fn();
vi.mock("@/server/auth/config", () => ({
  auth: () => mockAuth(),
}));

import { requireAdminSession } from "./admin-auth";
import { ApiError } from "@/lib/api-error";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireAdminSession", () => {
  it("returns adminId when session user is ADMIN", async () => {
    mockAuth.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });

    const result = await requireAdminSession();

    expect(result).toEqual({ adminId: "admin-1" });
  });

  it("throws 401 when no session", async () => {
    mockAuth.mockResolvedValue(null);

    await expect(requireAdminSession()).rejects.toThrow(ApiError);
    await expect(requireAdminSession()).rejects.toMatchObject({ status: 401 });
  });

  it("throws 401 when session has no user", async () => {
    mockAuth.mockResolvedValue({ user: null });

    await expect(requireAdminSession()).rejects.toMatchObject({ status: 401 });
  });

  it("throws 403 when user is not ADMIN", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1", role: "MEMBER" } });

    await expect(requireAdminSession()).rejects.toThrow(ApiError);
    await expect(requireAdminSession()).rejects.toMatchObject({ status: 403 });
  });
});
