// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ─────────────────────────────────────────────────────────────────
vi.mock("@/db", () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/db/queries/auth-queries", () => ({
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
}));
vi.mock("@/db/queries/auth-sessions", () => ({
  findActiveSessionsByUserId: vi.fn(),
  deleteSessionByToken: vi.fn(),
  deleteSessionById: vi.fn(),
  deleteOldestSessionForUser: vi.fn(),
  deleteAllSessionsForUser: vi.fn(),
  countActiveSessionsForUser: vi.fn(),
}));
vi.mock("@/server/auth/redis-session-cache", () => ({
  evictCachedSession: vi.fn(),
  evictAllUserSessions: vi.fn(),
}));
vi.mock("@/server/auth/config", () => ({
  getChallenge: vi.fn(),
  setChallenge: vi.fn(),
  deleteChallenge: vi.fn(),
  CHALLENGE_TTL: 300,
}));
vi.mock("@/lib/redis", () => ({
  getRedisClient: () => ({
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
  }),
}));
vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 2,
    resetAt: Date.now() + 900_000,
    limit: 3,
  }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));
vi.mock("@/services/event-bus", () => ({ eventBus: { emit: vi.fn() } }));
vi.mock("@/services/email-service", () => ({ enqueueEmailJob: vi.fn() }));
vi.mock("@/env", () => ({
  env: {
    ACCOUNT_LOCKOUT_SECONDS: 900,
    ACCOUNT_LOCKOUT_ATTEMPTS: 5,
    SESSION_TTL_SECONDS: 86400,
    MAX_SESSIONS_PER_USER: 5,
    NEXT_PUBLIC_APP_URL: "https://example.com",
  },
}));
vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("$hashed$"),
    compare: vi.fn(),
  },
  hash: vi.fn().mockResolvedValue("$hashed$"),
  compare: vi.fn(),
}));
vi.mock("ua-parser-js", () => ({
  UAParser: class {
    getBrowser() {
      return { name: "Chrome" };
    }
    getOS() {
      return { name: "macOS" };
    }
  },
}));

import bcryptjs from "bcryptjs";
import {
  hashPassword,
  verifyPassword,
  validatePasswordComplexity,
  parseDeviceInfo,
} from "@/services/auth-service";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("hashPassword", () => {
  it("calls bcrypt.hash with password", async () => {
    const result = await hashPassword("MyPassword1!");
    expect(bcryptjs.hash).toHaveBeenCalledWith("MyPassword1!", 12);
    expect(result).toBe("$hashed$");
  });
});

describe("verifyPassword", () => {
  it("returns true for matching password", async () => {
    vi.mocked(bcryptjs.compare).mockResolvedValue(true as never);
    const result = await verifyPassword("plain", "$hashed$");
    expect(result).toBe(true);
  });

  it("returns false for non-matching password", async () => {
    vi.mocked(bcryptjs.compare).mockResolvedValue(false as never);
    const result = await verifyPassword("wrong", "$hashed$");
    expect(result).toBe(false);
  });
});

describe("validatePasswordComplexity", () => {
  it("accepts valid complex password", () => {
    expect(validatePasswordComplexity("MyPass1!")).toBe(true);
    expect(validatePasswordComplexity("Str0ng@Pass")).toBe(true);
  });

  it("rejects password shorter than 8 chars", () => {
    expect(validatePasswordComplexity("Sh0rt!")).toBe(false);
  });

  it("rejects password without uppercase", () => {
    expect(validatePasswordComplexity("mypass1!")).toBe(false);
  });

  it("rejects password without lowercase", () => {
    expect(validatePasswordComplexity("MYPASS1!")).toBe(false);
  });

  it("rejects password without digit", () => {
    expect(validatePasswordComplexity("MyPasswd!")).toBe(false);
  });

  it("rejects password without special character", () => {
    expect(validatePasswordComplexity("MyPassword1")).toBe(false);
  });
});

describe("parseDeviceInfo", () => {
  it("parses user agent to readable device name", () => {
    const result = parseDeviceInfo("Mozilla/5.0 (Macintosh...)");
    expect(result).toBe("Chrome on macOS");
  });

  it("returns Unknown device for null user agent", () => {
    const result = parseDeviceInfo(null);
    expect(result).toBe("Unknown device");
  });
});
