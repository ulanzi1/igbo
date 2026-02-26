// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetCachedSession = vi.fn();

vi.mock("@/server/auth/redis-session-cache", () => ({
  getCachedSession: (...args: unknown[]) => mockGetCachedSession(...args),
}));

import { authMiddleware } from "./auth";
import type { Socket } from "socket.io";

function makeSocket(token?: unknown): Socket {
  return {
    handshake: { auth: token !== undefined ? { token } : {} },
    data: {},
  } as unknown as Socket;
}

const VALID_SESSION = {
  userId: "00000000-0000-4000-8000-000000000001",
  sessionToken: "tok_abc",
  expires: new Date(Date.now() + 86400_000),
  lastActiveAt: new Date(),
  createdAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("authMiddleware", () => {
  it("calls next() with error when token is missing", async () => {
    const socket = makeSocket();
    const next = vi.fn();

    await authMiddleware(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0]?.message).toContain("UNAUTHORIZED");
    expect(mockGetCachedSession).not.toHaveBeenCalled();
  });

  it("calls next() with error when session is not found", async () => {
    mockGetCachedSession.mockResolvedValue(null);
    const socket = makeSocket("tok_invalid");
    const next = vi.fn();

    await authMiddleware(socket, next);

    expect(mockGetCachedSession).toHaveBeenCalledWith("tok_invalid");
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0]?.message).toContain("UNAUTHORIZED");
  });

  it("calls next() with error when session is expired", async () => {
    mockGetCachedSession.mockResolvedValue({
      ...VALID_SESSION,
      expires: new Date(Date.now() - 1000),
    });
    const socket = makeSocket("tok_expired");
    const next = vi.fn();

    await authMiddleware(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0]?.message).toContain("expired");
  });

  it("attaches userId and calls next() without error on valid session", async () => {
    mockGetCachedSession.mockResolvedValue(VALID_SESSION);
    const socket = makeSocket("tok_valid");
    const next = vi.fn();

    await authMiddleware(socket, next);

    expect(socket.data.userId).toBe(VALID_SESSION.userId);
    expect(next).toHaveBeenCalledWith();
    expect(next.mock.calls[0]).toHaveLength(0);
  });

  it("calls next() with error when getCachedSession throws (Redis down)", async () => {
    mockGetCachedSession.mockRejectedValue(new Error("Redis connection refused"));
    const socket = makeSocket("tok_valid");
    const next = vi.fn();

    await authMiddleware(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0]?.message).toContain("session validation failed");
  });
});
