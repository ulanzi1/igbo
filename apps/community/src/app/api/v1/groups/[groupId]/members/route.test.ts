// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAuthenticatedSession = vi.fn();
const mockListActiveGroupMembers = vi.fn();

vi.mock("@igbo/auth/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@igbo/db/queries/groups", () => ({
  listActiveGroupMembers: (...args: unknown[]) => mockListActiveGroupMembers(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    GROUP_DETAIL: { maxRequests: 60, windowMs: 60_000 },
  },
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000, limit: 10 }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { GET } from "./route";
import { ApiError } from "@/lib/api-error";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const GROUP_ID = "00000000-0000-4000-8000-000000000002";
const BASE_URL = `https://localhost:3000/api/v1/groups/${GROUP_ID}/members`;

const JOINED_AT = new Date("2025-01-01T00:00:00.000Z");

const MOCK_MEMBERS = [
  {
    userId: USER_ID,
    displayName: "Alice",
    photoUrl: null,
    role: "leader" as const,
    joinedAt: JOINED_AT,
    mutedUntil: null,
  },
  {
    userId: "00000000-0000-4000-8000-000000000009",
    displayName: "Bob",
    photoUrl: "https://example.com/bob.jpg",
    role: "member" as const,
    joinedAt: new Date("2025-02-01T00:00:00.000Z"),
    mutedUntil: null,
  },
];

beforeEach(() => {
  mockRequireAuthenticatedSession.mockReset();
  mockListActiveGroupMembers.mockReset();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID, role: "MEMBER" });
});

describe("GET /api/v1/groups/[groupId]/members", () => {
  it("returns 200 with serialized members list", async () => {
    mockListActiveGroupMembers.mockResolvedValue(MOCK_MEMBERS);

    const req = new Request(BASE_URL);
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.members).toHaveLength(2);
    expect(body.data.members[0]).toEqual({
      userId: USER_ID,
      displayName: "Alice",
      photoUrl: null,
      role: "leader",
      joinedAt: JOINED_AT.toISOString(),
      mutedUntil: null,
    });
  });

  it("returns nextCursor when full page returned", async () => {
    // Build a full page of 50 members with valid joinedAt dates
    const baseDate = new Date("2025-01-01T00:00:00.000Z");
    const fullPage = Array.from({ length: 50 }, (_, i) => ({
      userId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      displayName: `Member ${i}`,
      photoUrl: null,
      role: "member" as const,
      joinedAt: new Date(baseDate.getTime() + i * 86400000),
    }));
    mockListActiveGroupMembers.mockResolvedValue(fullPage);

    const req = new Request(BASE_URL);
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.nextCursor).not.toBeNull();
  });

  it("returns null nextCursor when partial page returned", async () => {
    mockListActiveGroupMembers.mockResolvedValue(MOCK_MEMBERS); // only 2, less than 50

    const req = new Request(BASE_URL);
    const res = await GET(req);

    const body = await res.json();
    expect(body.data.nextCursor).toBeNull();
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ status: 401, title: "Unauthorized" }),
    );

    const req = new Request(BASE_URL);
    const res = await GET(req);

    expect(res.status).toBe(401);
  });
});
