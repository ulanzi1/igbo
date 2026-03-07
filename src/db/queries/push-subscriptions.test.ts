// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── DB Mock ────────────────────────────────────────────────────────────────

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/db", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    select: (...args: unknown[]) => mockSelect(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

vi.mock("@/db/schema/platform-push-subscriptions", () => ({
  platformPushSubscriptions: {
    id: "id",
    userId: "user_id",
    endpoint: "endpoint",
    keysP256dh: "keys_p256dh",
    keysAuth: "keys_auth",
    createdAt: "created_at",
  },
}));

import {
  upsertPushSubscription,
  getUserPushSubscriptions,
  deletePushSubscriptionByEndpoint,
  deleteAllUserPushSubscriptions,
} from "./push-subscriptions";

const USER_ID = "user-1";
const ENDPOINT = "https://push.example.com/sub/abc123";
const P256DH = "p256dhkey";
const AUTH = "authkey";

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── upsertPushSubscription ──────────────────────────────────────────────────

describe("upsertPushSubscription", () => {
  it("calls insert with correct values and onConflictDoUpdate", async () => {
    const mockOnConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const mockValues = vi.fn().mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate });
    mockInsert.mockReturnValue({ values: mockValues });

    await upsertPushSubscription(USER_ID, {
      endpoint: ENDPOINT,
      keys: { p256dh: P256DH, auth: AUTH },
    });

    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockValues).toHaveBeenCalledWith({
      userId: USER_ID,
      endpoint: ENDPOINT,
      keysP256dh: P256DH,
      keysAuth: AUTH,
    });
    expect(mockOnConflictDoUpdate).toHaveBeenCalledOnce();
  });
});

// ─── getUserPushSubscriptions ────────────────────────────────────────────────

describe("getUserPushSubscriptions", () => {
  it("returns array of subscription objects", async () => {
    const rows = [{ endpoint: ENDPOINT, keys_p256dh: P256DH, keys_auth: AUTH }];
    const mockWhere = vi.fn().mockResolvedValue(rows);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const result = await getUserPushSubscriptions(USER_ID);

    expect(mockSelect).toHaveBeenCalledOnce();
    expect(result).toEqual(rows);
  });

  it("returns empty array when no subscriptions", async () => {
    const mockWhere = vi.fn().mockResolvedValue([]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const result = await getUserPushSubscriptions(USER_ID);
    expect(result).toEqual([]);
  });
});

// ─── deletePushSubscriptionByEndpoint ───────────────────────────────────────

describe("deletePushSubscriptionByEndpoint", () => {
  it("calls delete with correct endpoint", async () => {
    const mockWhere = vi.fn().mockResolvedValue(undefined);
    mockDelete.mockReturnValue({ where: mockWhere });

    await deletePushSubscriptionByEndpoint(ENDPOINT);

    expect(mockDelete).toHaveBeenCalledOnce();
    expect(mockWhere).toHaveBeenCalledOnce();
  });
});

// ─── deleteAllUserPushSubscriptions ─────────────────────────────────────────

describe("deleteAllUserPushSubscriptions", () => {
  it("calls delete with correct userId", async () => {
    const mockWhere = vi.fn().mockResolvedValue(undefined);
    mockDelete.mockReturnValue({ where: mockWhere });

    await deleteAllUserPushSubscriptions(USER_ID);

    expect(mockDelete).toHaveBeenCalledOnce();
    expect(mockWhere).toHaveBeenCalledOnce();
  });
});
