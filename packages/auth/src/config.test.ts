// @vitest-environment node
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

vi.mock("server-only", () => ({}));

// ─── Mock Redis ───────────────────────────────────────────────────────────────
const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();
const mockRedisDel = vi.fn();
const mockRedisGetdel = vi.fn();

vi.mock("./redis", () => ({
  getAuthRedis: () => ({
    get: mockRedisGet,
    set: mockRedisSet,
    del: mockRedisDel,
    getdel: mockRedisGetdel,
  }),
}));

// ─── Mock session-cache ───────────────────────────────────────────────────────
const mockCacheSession = vi.fn();
const mockGetCachedSession = vi.fn();
const mockEvictCachedSession = vi.fn();

vi.mock("./session-cache", () => ({
  cacheSession: (...args: unknown[]) => mockCacheSession(...args),
  getCachedSession: (...args: unknown[]) => mockGetCachedSession(...args),
  evictCachedSession: (...args: unknown[]) => mockEvictCachedSession(...args),
}));

// ─── Mock @igbo/db ────────────────────────────────────────────────────────────
const mockDbInsert = vi.fn();
const mockDbSelect = vi.fn();
const mockFindSessionByToken = vi.fn();
const mockDeleteSessionByToken = vi.fn();

vi.mock("@igbo/db", () => ({
  db: {
    insert: (...args: unknown[]) => mockDbInsert(...args),
    select: (...args: unknown[]) => mockDbSelect(...args),
  },
}));

vi.mock("@igbo/db/queries/auth-sessions", () => ({
  findSessionByToken: (...args: unknown[]) => mockFindSessionByToken(...args),
  deleteSessionByToken: (...args: unknown[]) => mockDeleteSessionByToken(...args),
}));

vi.mock("@igbo/db/schema/auth-users", () => ({
  authUsers: { id: "id", accountStatus: "account_status", email: "email" },
}));
vi.mock("@igbo/db/schema/auth-sessions", () => ({
  authSessions: {
    id: "id",
    sessionToken: "session_token",
    userId: "user_id",
    expires: "expires",
  },
}));
vi.mock("@igbo/db/schema/community-profiles", () => ({
  communityProfiles: { userId: "user_id", profileCompletedAt: "profile_completed_at" },
}));

vi.mock("@auth/drizzle-adapter", () => ({
  DrizzleAdapter: vi.fn(() => ({
    createSession: vi.fn(),
    getSessionAndUser: vi.fn(),
    deleteSession: vi.fn(),
  })),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const capturedConfig = vi.hoisted(() => ({ value: null as any }));

vi.mock("next-auth", () => ({
  default: (config: unknown) => {
    capturedConfig.value = config;
    return config;
  },
}));

vi.mock("next-auth/providers/credentials", () => ({
  default: (config: unknown) => config,
}));

import {
  getChallenge,
  setChallenge,
  consumeChallenge,
  deleteChallenge,
  CHALLENGE_TTL,
  type ChallengeData,
} from "./config";

const MOCK_CHALLENGE_DATA: ChallengeData = {
  userId: "user-1",
  mfaVerified: true,
  requiresMfaSetup: false,
  deviceName: "Chrome on macOS",
  deviceIp: "1.2.3.4",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRedisGet.mockResolvedValue(null);
  mockRedisSet.mockResolvedValue("OK");
  mockRedisDel.mockResolvedValue(1);
  mockRedisGetdel.mockResolvedValue(null);
  mockCacheSession.mockResolvedValue(undefined);
  mockGetCachedSession.mockResolvedValue(null);
  mockEvictCachedSession.mockResolvedValue(undefined);
});

// ─── CHALLENGE_TTL ────────────────────────────────────────────────────────────

describe("CHALLENGE_TTL", () => {
  it("is 300 seconds (5 minutes)", () => {
    expect(CHALLENGE_TTL).toBe(300);
  });
});

// ─── getChallenge ─────────────────────────────────────────────────────────────

describe("getChallenge", () => {
  it("returns null on cache miss", async () => {
    mockRedisGet.mockResolvedValue(null);
    const result = await getChallenge("token-miss");
    expect(result).toBeNull();
    expect(mockRedisGet).toHaveBeenCalledWith("challenge:token-miss");
  });

  it("returns parsed ChallengeData on cache hit", async () => {
    mockRedisGet.mockResolvedValue(JSON.stringify(MOCK_CHALLENGE_DATA));
    const result = await getChallenge("token-hit");
    expect(result).toEqual(MOCK_CHALLENGE_DATA);
  });

  it("returns null on Redis failure (graceful fallback)", async () => {
    mockRedisGet.mockRejectedValue(new Error("Redis unavailable"));
    const result = await getChallenge("token-err");
    expect(result).toBeNull();
  });
});

// ─── setChallenge ─────────────────────────────────────────────────────────────

describe("setChallenge", () => {
  it("stores challenge data with CHALLENGE_TTL", async () => {
    await setChallenge("token-abc", MOCK_CHALLENGE_DATA);
    expect(mockRedisSet).toHaveBeenCalledWith(
      "challenge:token-abc",
      JSON.stringify(MOCK_CHALLENGE_DATA),
      "EX",
      CHALLENGE_TTL,
    );
  });
});

// ─── consumeChallenge ─────────────────────────────────────────────────────────

describe("consumeChallenge", () => {
  it("returns null when no challenge exists", async () => {
    mockRedisGetdel.mockResolvedValue(null);
    const result = await consumeChallenge("token-none");
    expect(result).toBeNull();
    expect(mockRedisGetdel).toHaveBeenCalledWith("challenge:token-none");
  });

  it("atomically reads and deletes the challenge (single-use)", async () => {
    mockRedisGetdel.mockResolvedValue(JSON.stringify(MOCK_CHALLENGE_DATA));
    const result = await consumeChallenge("token-use");
    expect(result).toEqual(MOCK_CHALLENGE_DATA);
    expect(mockRedisGetdel).toHaveBeenCalledWith("challenge:token-use");
  });

  it("returns null on Redis failure", async () => {
    mockRedisGetdel.mockRejectedValue(new Error("Redis unavailable"));
    const result = await consumeChallenge("token-fail");
    expect(result).toBeNull();
  });
});

// ─── deleteChallenge ──────────────────────────────────────────────────────────

describe("deleteChallenge", () => {
  it("deletes the challenge key", async () => {
    await deleteChallenge("token-del");
    expect(mockRedisDel).toHaveBeenCalledWith("challenge:token-del");
  });

  it("does not throw on Redis failure", async () => {
    mockRedisDel.mockRejectedValue(new Error("Redis unavailable"));
    await expect(deleteChallenge("token-fail")).resolves.toBeUndefined();
  });
});

// ─── Smoke test: exports ──────────────────────────────────────────────────────

describe("@igbo/auth exports smoke test", () => {
  it("exports challenge helpers", () => {
    expect(typeof getChallenge).toBe("function");
    expect(typeof setChallenge).toBe("function");
    expect(typeof consumeChallenge).toBe("function");
    expect(typeof deleteChallenge).toBe("function");
    expect(CHALLENGE_TTL).toBe(300);
  });
});

// ─── NextAuth authorize callback ─────────────────────────────────────────────
// NextAuth is mocked to return the config it receives, so we can test callbacks directly.

describe("NextAuth authorize callback", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let authorize: (credentials: Record<string, unknown>) => Promise<any>;

  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = capturedConfig.value;
    authorize = config.providers[0].authorize;
  });

  function mockSelectChain(...results: unknown[][]) {
    for (const result of results) {
      mockDbSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(result),
          }),
        }),
      });
    }
  }

  it("returns null when no challengeToken provided", async () => {
    const result = await authorize({});
    expect(result).toBeNull();
  });

  it("returns null when challenge does not exist", async () => {
    mockRedisGetdel.mockResolvedValue(null);
    const result = await authorize({ challengeToken: "nonexistent" });
    expect(result).toBeNull();
  });

  it("returns null when mfaVerified is false", async () => {
    mockRedisGetdel.mockResolvedValue(
      JSON.stringify({ ...MOCK_CHALLENGE_DATA, mfaVerified: false }),
    );
    const result = await authorize({ challengeToken: "unverified" });
    expect(result).toBeNull();
  });

  it("returns null when user account is not APPROVED", async () => {
    mockRedisGetdel.mockResolvedValue(JSON.stringify(MOCK_CHALLENGE_DATA));
    mockSelectChain([
      {
        id: "user-1",
        email: "test@example.com",
        name: "Test",
        role: "MEMBER",
        accountStatus: "BANNED",
        membershipTier: "BASIC",
      },
    ]);
    const result = await authorize({ challengeToken: "banned-user" });
    expect(result).toBeNull();
  });

  it("returns null when user not found in DB", async () => {
    mockRedisGetdel.mockResolvedValue(JSON.stringify(MOCK_CHALLENGE_DATA));
    mockSelectChain([]);
    const result = await authorize({ challengeToken: "no-user" });
    expect(result).toBeNull();
  });

  it("returns user with correct fields when challenge is valid", async () => {
    mockRedisGetdel.mockResolvedValue(JSON.stringify(MOCK_CHALLENGE_DATA));
    mockSelectChain(
      [
        {
          id: "user-1",
          email: "test@example.com",
          name: "Test User",
          role: "MEMBER",
          accountStatus: "APPROVED",
          membershipTier: "PROFESSIONAL",
        },
      ],
      [{ profileCompletedAt: new Date("2024-01-01"), photoUrl: "https://example.com/photo.jpg" }],
    );

    const result = await authorize({ challengeToken: "valid-token" });
    expect(result).toEqual({
      id: "user-1",
      email: "test@example.com",
      name: "Test User",
      image: "https://example.com/photo.jpg",
      role: "MEMBER",
      accountStatus: "APPROVED",
      profileCompleted: true,
      membershipTier: "PROFESSIONAL",
    });
  });

  it("returns profileCompleted=false when no profile exists", async () => {
    mockRedisGetdel.mockResolvedValue(JSON.stringify(MOCK_CHALLENGE_DATA));
    mockSelectChain(
      [
        {
          id: "user-1",
          email: "test@example.com",
          name: null,
          role: "MEMBER",
          accountStatus: "APPROVED",
          membershipTier: "BASIC",
        },
      ],
      [], // no profile
    );

    const result = await authorize({ challengeToken: "no-profile" });
    expect(result).not.toBeNull();
    expect(result.profileCompleted).toBe(false);
    expect(result.image).toBeNull();
  });

  it("stores pending device info in Redis for createSession to pick up", async () => {
    mockRedisGetdel.mockResolvedValue(JSON.stringify(MOCK_CHALLENGE_DATA));
    mockSelectChain(
      [
        {
          id: "user-1",
          email: "test@example.com",
          name: "Test",
          role: "MEMBER",
          accountStatus: "APPROVED",
          membershipTier: "BASIC",
        },
      ],
      [],
    );

    await authorize({ challengeToken: "device-info" });
    expect(mockRedisSet).toHaveBeenCalledWith(
      "pending_session_device:user-1",
      JSON.stringify({ deviceName: "Chrome on macOS", deviceIp: "1.2.3.4" }),
      "EX",
      30,
    );
  });
});

// ─── NextAuth jwt callback ───────────────────────────────────────────────────

describe("NextAuth jwt callback", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let jwtCallback: (params: Record<string, unknown>) => any;

  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = capturedConfig.value;
    jwtCallback = config.callbacks.jwt;
  });

  it("populates token fields from user on initial sign-in", () => {
    const token = {} as Record<string, unknown>;
    const user = {
      id: "user-1",
      role: "ADMIN",
      accountStatus: "APPROVED",
      profileCompleted: true,
      membershipTier: "TOP_TIER",
      image: "https://photo.jpg",
    };
    const result = jwtCallback({ token, user, trigger: undefined, session: undefined });
    expect(result.id).toBe("user-1");
    expect(result.role).toBe("ADMIN");
    expect(result.accountStatus).toBe("APPROVED");
    expect(result.profileCompleted).toBe(true);
    expect(result.membershipTier).toBe("TOP_TIER");
    expect(result.picture).toBe("https://photo.jpg");
  });

  it("defaults membershipTier to BASIC when not provided", () => {
    const token = {} as Record<string, unknown>;
    const user = {
      id: "user-1",
      role: "MEMBER",
      accountStatus: "APPROVED",
      profileCompleted: false,
    };
    const result = jwtCallback({ token, user, trigger: undefined, session: undefined });
    expect(result.membershipTier).toBe("BASIC");
  });

  it("updates profileCompleted on session update trigger", () => {
    const token = { id: "user-1", profileCompleted: false, picture: null } as Record<
      string,
      unknown
    >;
    const result = jwtCallback({
      token,
      user: undefined,
      trigger: "update",
      session: { profileCompleted: true },
    });
    expect(result.profileCompleted).toBe(true);
  });

  it("updates picture on session update trigger", () => {
    const token = { id: "user-1", profileCompleted: true, picture: null } as Record<
      string,
      unknown
    >;
    const result = jwtCallback({
      token,
      user: undefined,
      trigger: "update",
      session: { picture: "https://new-photo.jpg" },
    });
    expect(result.picture).toBe("https://new-photo.jpg");
  });

  it("does not modify token when no user and no update trigger", () => {
    const token = { id: "existing", role: "MEMBER" } as Record<string, unknown>;
    const result = jwtCallback({ token, user: undefined, trigger: undefined, session: undefined });
    expect(result.id).toBe("existing");
    expect(result.role).toBe("MEMBER");
  });
});

// ─── NextAuth session callback ───────────────────────────────────────────────

describe("NextAuth session callback", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sessionCallback: (params: Record<string, unknown>) => Promise<any>;

  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = capturedConfig.value;
    sessionCallback = config.callbacks.session;
    process.env.AUTH_SECRET = "test-secret-must-be-at-least-32-bytes-long-for-hs256";
  });

  it("populates session user fields from JWT token", async () => {
    const session = { user: {} } as Record<string, Record<string, unknown>>;
    const token = {
      id: "user-1",
      role: "ADMIN",
      accountStatus: "APPROVED",
      profileCompleted: true,
      membershipTier: "TOP_TIER",
      picture: "https://photo.jpg",
    };
    const result = await sessionCallback({ session, token });
    expect(result.user.id).toBe("user-1");
    expect(result.user.role).toBe("ADMIN");
    expect(result.user.accountStatus).toBe("APPROVED");
    expect(result.user.profileCompleted).toBe(true);
    expect(result.user.membershipTier).toBe("TOP_TIER");
    expect(result.user.image).toBe("https://photo.jpg");
  });

  it("creates a valid Socket.IO JWT sessionToken", async () => {
    const session = { user: {} } as Record<string, unknown>;
    const token = {
      id: "user-1",
      role: "MEMBER",
      accountStatus: "APPROVED",
      profileCompleted: false,
      membershipTier: "BASIC",
      picture: null,
    };
    const result = await sessionCallback({ session, token });
    expect(typeof result.sessionToken).toBe("string");
    // JWT has 3 dot-separated parts (header.payload.signature)
    expect((result.sessionToken as string).split(".")).toHaveLength(3);
  });

  it("defaults membershipTier to BASIC when token has no tier", async () => {
    const session = { user: {} } as Record<string, Record<string, unknown>>;
    const token = {
      id: "user-1",
      role: "MEMBER",
      accountStatus: "APPROVED",
      profileCompleted: false,
      picture: null,
    };
    const result = await sessionCallback({ session, token });
    expect(result.user.membershipTier).toBe("BASIC");
  });
});

// ─── Custom adapter ──────────────────────────────────────────────────────────

describe("Custom adapter", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let adapter: any;

  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = capturedConfig.value;
    adapter = config.adapter;
  });

  describe("deleteSession", () => {
    it("evicts cache and deletes from DB", async () => {
      await adapter.deleteSession("token-123");
      expect(mockEvictCachedSession).toHaveBeenCalledWith("token-123");
      expect(mockDeleteSessionByToken).toHaveBeenCalledWith("token-123");
    });
  });

  describe("createSession", () => {
    it("inserts session into DB and caches it", async () => {
      const mockSession = {
        id: "sess-1",
        sessionToken: "tok-abc",
        userId: "user-1",
        expires: new Date("2025-01-01"),
        deviceName: "Chrome on macOS",
        deviceIp: "1.2.3.4",
      };
      // Mock device info lookup
      mockRedisGet.mockResolvedValue(
        JSON.stringify({ deviceName: "Chrome on macOS", deviceIp: "1.2.3.4" }),
      );
      mockDbInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockSession]),
        }),
      });

      const result = await adapter.createSession({
        sessionToken: "tok-abc",
        userId: "user-1",
        expires: new Date("2025-01-01"),
      });

      expect(mockDbInsert).toHaveBeenCalled();
      expect(mockCacheSession).toHaveBeenCalledWith(mockSession, expect.any(Number));
      expect(result).toBeTruthy();
    });
  });
});
