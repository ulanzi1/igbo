// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/services/permissions", () => ({ requireAuthenticatedSession: vi.fn() }));
vi.mock("@/services/rate-limiter", () => ({
  applyRateLimit: vi.fn(),
  RATE_LIMIT_PRESETS: { GROUP_CREATE: { maxRequests: 5, windowMs: 3_600_000 } },
}));
vi.mock("@/services/group-service", () => ({ createGroupForUser: vi.fn() }));

import { createGroupAction } from "./create-group";
import { requireAuthenticatedSession } from "@/services/permissions";
import { applyRateLimit } from "@/services/rate-limiter";
import { createGroupForUser } from "@/services/group-service";

const mockRequireAuth = vi.mocked(requireAuthenticatedSession);
const mockApplyRateLimit = vi.mocked(applyRateLimit);
const mockCreateGroupForUser = vi.mocked(createGroupForUser);

const USER_ID = "00000000-0000-4000-8000-000000000001";
const GROUP_ID = "00000000-0000-4000-8000-000000000002";

const allowedRateLimit = { allowed: true, limit: 5, remaining: 4, retryAfter: null };

const validInput = {
  name: "London Chapter",
  visibility: "public" as const,
  joinType: "open" as const,
  postingPermission: "all_members" as const,
  commentingPermission: "open" as const,
};

beforeEach(() => {
  mockRequireAuth.mockReset();
  mockApplyRateLimit.mockReset();
  mockCreateGroupForUser.mockReset();

  mockRequireAuth.mockResolvedValue({ userId: USER_ID, role: "MEMBER" } as Awaited<
    ReturnType<typeof requireAuthenticatedSession>
  >);
  mockApplyRateLimit.mockResolvedValue(
    allowedRateLimit as Awaited<ReturnType<typeof applyRateLimit>>,
  );
  mockCreateGroupForUser.mockResolvedValue({
    id: GROUP_ID,
    name: "London Chapter",
    description: null,
    bannerUrl: null,
    visibility: "public",
    joinType: "open",
    postingPermission: "all_members",
    commentingPermission: "open",
    memberLimit: null,
    creatorId: USER_ID,
    memberCount: 1,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
});

describe("createGroupAction", () => {
  it("returns { groupId } on success", async () => {
    const result = await createGroupAction(validInput);

    expect(result).toEqual({ groupId: GROUP_ID });
    expect(mockCreateGroupForUser).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ name: "London Chapter" }),
    );
  });

  it("returns UNAUTHORIZED when not authenticated", async () => {
    mockRequireAuth.mockRejectedValue(new Error("Unauthorized"));

    const result = await createGroupAction(validInput);

    expect(result).toEqual(expect.objectContaining({ errorCode: "UNAUTHORIZED" }));
    expect(mockCreateGroupForUser).not.toHaveBeenCalled();
  });

  it("returns RATE_LIMIT_EXCEEDED when rate limited", async () => {
    mockApplyRateLimit.mockResolvedValue({
      allowed: false,
      limit: 5,
      remaining: 0,
      retryAfter: 3600,
    } as Awaited<ReturnType<typeof applyRateLimit>>);

    const result = await createGroupAction(validInput);

    expect(result).toEqual(expect.objectContaining({ errorCode: "RATE_LIMIT_EXCEEDED" }));
  });

  it("returns VALIDATION_ERROR for missing name", async () => {
    const result = await createGroupAction({
      ...validInput,
      name: "",
    });

    expect(result).toEqual(expect.objectContaining({ errorCode: "VALIDATION_ERROR" }));
    expect(mockCreateGroupForUser).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_ERROR for name exceeding 100 chars", async () => {
    const result = await createGroupAction({
      ...validInput,
      name: "a".repeat(101),
    });

    expect(result).toEqual(expect.objectContaining({ errorCode: "VALIDATION_ERROR" }));
  });

  it("returns VALIDATION_ERROR for description exceeding 1000 chars", async () => {
    const result = await createGroupAction({
      ...validInput,
      description: "x".repeat(1001),
    });

    expect(result).toEqual(expect.objectContaining({ errorCode: "VALIDATION_ERROR" }));
  });

  it("returns PERMISSION_DENIED when service throws 403", async () => {
    const err = Object.assign(new Error("Forbidden"), { status: 403 });
    mockCreateGroupForUser.mockRejectedValue(err);

    const result = await createGroupAction(validInput);

    expect(result).toEqual(expect.objectContaining({ errorCode: "PERMISSION_DENIED" }));
  });

  it("includes memberLimit when provided", async () => {
    await createGroupAction({ ...validInput, memberLimit: 50 });

    expect(mockCreateGroupForUser).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ memberLimit: 50 }),
    );
  });
});
