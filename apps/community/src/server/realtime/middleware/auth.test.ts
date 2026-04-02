// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SignJWT } from "jose";
import type { Socket } from "socket.io";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: "postgres://test",
    REDIS_URL: "redis://localhost:6379",
    ADMIN_EMAIL: "admin@test.com",
    ADMIN_PASSWORD: "testpassword",
    AUTH_SECRET: "test-secret",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    NEXT_PUBLIC_REALTIME_URL: "http://localhost:3001",
    HETZNER_S3_ENDPOINT: "https://s3.test",
    HETZNER_S3_REGION: "eu-central",
    HETZNER_S3_BUCKET: "test-bucket",
    HETZNER_S3_ACCESS_KEY_ID: "test-key",
    HETZNER_S3_SECRET_ACCESS_KEY: "test-secret-key",
    HETZNER_S3_PUBLIC_URL: "https://s3.test/bucket",
  },
}));

const mockDbLimit = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: (...args: unknown[]) => mockDbLimit(...args),
        }),
      }),
    }),
  },
}));

const TEST_SECRET = "test-auth-secret-for-jwt-signing";
const TEST_USER_ID = "00000000-0000-4000-8000-000000000001";

function makeSocket(token?: unknown): Socket {
  return {
    handshake: { auth: token !== undefined ? { token } : {} },
    data: {},
  } as unknown as Socket;
}

async function makeValidToken(userId: string = TEST_USER_ID, expiresIn = "1h"): Promise<string> {
  const secret = new TextEncoder().encode(TEST_SECRET);
  return new SignJWT({ id: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(expiresIn)
    .sign(secret);
}

async function makeExpiredToken(userId: string = TEST_USER_ID): Promise<string> {
  const secret = new TextEncoder().encode(TEST_SECRET);
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ id: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(now - 3600)
    .setIssuedAt(now - 7200)
    .sign(secret);
}

describe("authMiddleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    // Default: user is approved (not banned/suspended)
    mockDbLimit.mockResolvedValue([{ id: TEST_USER_ID, accountStatus: "APPROVED" }]);
  });

  // AUTH_SECRET is captured at module load time, so we must set process.env
  // before importing the module via vi.resetModules() + dynamic import.
  async function getAuthMiddleware(secret?: string) {
    if (secret !== undefined) {
      process.env.AUTH_SECRET = secret;
    } else {
      delete process.env.AUTH_SECRET;
    }
    const mod = await import("./auth");
    return mod.authMiddleware;
  }

  it("calls next() with error when token is missing", async () => {
    const authMiddleware = await getAuthMiddleware(TEST_SECRET);
    const socket = makeSocket();
    const next = vi.fn();

    await authMiddleware(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0]?.message).toContain("UNAUTHORIZED");
    expect(next.mock.calls[0][0]?.message).toContain("missing session token");
  });

  it("calls next() with error when token is not a string", async () => {
    const authMiddleware = await getAuthMiddleware(TEST_SECRET);
    const socket = makeSocket(12345);
    const next = vi.fn();

    await authMiddleware(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0]?.message).toContain("UNAUTHORIZED");
  });

  it("calls next() with error when AUTH_SECRET is not configured", async () => {
    const authMiddleware = await getAuthMiddleware(undefined);
    const socket = makeSocket("some-token");
    const next = vi.fn();

    await authMiddleware(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0]?.message).toContain("AUTH_SECRET not configured");
  });

  it("calls next() with error when token is signed with wrong secret", async () => {
    const authMiddleware = await getAuthMiddleware(TEST_SECRET);
    const wrongSecret = new TextEncoder().encode("wrong-secret");
    const badToken = await new SignJWT({ id: TEST_USER_ID })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(wrongSecret);

    const socket = makeSocket(badToken);
    const next = vi.fn();

    await authMiddleware(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0]?.message).toContain("session validation failed");
  });

  it("calls next() with error when token is expired", async () => {
    const authMiddleware = await getAuthMiddleware(TEST_SECRET);
    const expiredToken = await makeExpiredToken();
    const socket = makeSocket(expiredToken);
    const next = vi.fn();

    await authMiddleware(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0]?.message).toContain("session validation failed");
  });

  it("calls next() with error when JWT is missing user id", async () => {
    const authMiddleware = await getAuthMiddleware(TEST_SECRET);
    const secret = new TextEncoder().encode(TEST_SECRET);
    const noIdToken = await new SignJWT({ sub: "no-id-field" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(secret);

    const socket = makeSocket(noIdToken);
    const next = vi.fn();

    await authMiddleware(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0]?.message).toContain("JWT missing user id");
  });

  it("attaches userId and calls next() without error on valid token", async () => {
    const authMiddleware = await getAuthMiddleware(TEST_SECRET);
    const validToken = await makeValidToken();
    const socket = makeSocket(validToken);
    const next = vi.fn();

    await authMiddleware(socket, next);

    expect(socket.data.userId).toBe(TEST_USER_ID);
    expect(next).toHaveBeenCalledWith();
    expect(next.mock.calls[0]).toHaveLength(0);
  });

  it("calls next() with error for BANNED user (Story 11.3)", async () => {
    mockDbLimit.mockResolvedValue([{ id: TEST_USER_ID, accountStatus: "BANNED" }]);
    const authMiddleware = await getAuthMiddleware(TEST_SECRET);
    const validToken = await makeValidToken();
    const socket = makeSocket(validToken);
    const next = vi.fn();

    await authMiddleware(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0]?.message).toContain("banned");
  });

  it("calls next() with error for SUSPENDED user (Story 11.3)", async () => {
    mockDbLimit.mockResolvedValue([{ id: TEST_USER_ID, accountStatus: "SUSPENDED" }]);
    const authMiddleware = await getAuthMiddleware(TEST_SECRET);
    const validToken = await makeValidToken();
    const socket = makeSocket(validToken);
    const next = vi.fn();

    await authMiddleware(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0]?.message).toContain("suspended");
  });
});
