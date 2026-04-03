// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockAuth = vi.fn();
vi.mock("./config", () => ({
  auth: () => mockAuth(),
}));

const mockFindUserById = vi.hoisted(() => vi.fn());
vi.mock("@igbo/db/queries/auth-queries", () => ({
  findUserById: mockFindUserById,
}));

import { requireAdminSession } from "./admin-auth";
import { ApiError } from "./api-error";

beforeEach(() => {
  vi.clearAllMocks();
  // Default: admin account is active
  mockFindUserById.mockResolvedValue({ id: "admin-1", accountStatus: "APPROVED" });
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

  it("throws 403 when admin account is BANNED", async () => {
    mockAuth.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mockFindUserById.mockResolvedValue({ id: "admin-1", accountStatus: "BANNED" });

    await expect(requireAdminSession()).rejects.toMatchObject({ status: 403 });
  });

  it("throws 403 when admin account is SUSPENDED", async () => {
    mockAuth.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mockFindUserById.mockResolvedValue({ id: "admin-1", accountStatus: "SUSPENDED" });

    await expect(requireAdminSession()).rejects.toMatchObject({ status: 403 });
  });

  it("throws 401 when findUserById returns null (deleted admin)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mockFindUserById.mockResolvedValue(null);

    await expect(requireAdminSession()).rejects.toMatchObject({ status: 401 });
  });

  it("throws 403 when admin account is PENDING_DELETION", async () => {
    mockAuth.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mockFindUserById.mockResolvedValue({ id: "admin-1", accountStatus: "PENDING_DELETION" });

    await expect(requireAdminSession()).rejects.toMatchObject({ status: 403 });
  });

  it("throws 403 when admin account is ANONYMIZED", async () => {
    mockAuth.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mockFindUserById.mockResolvedValue({ id: "admin-1", accountStatus: "ANONYMIZED" });

    await expect(requireAdminSession()).rejects.toMatchObject({ status: 403 });
  });
});
