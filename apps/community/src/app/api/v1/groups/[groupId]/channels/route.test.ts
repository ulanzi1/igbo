// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAuthenticatedSession = vi.fn();
const mockGetGroupMember = vi.fn();
const mockListChannelsForGroup = vi.fn();
const mockCreateChannel = vi.fn();

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@/db/queries/groups", () => ({
  getGroupMember: (...args: unknown[]) => mockGetGroupMember(...args),
}));

vi.mock("@/services/group-channel-service", () => ({
  listChannelsForGroup: (...args: unknown[]) => mockListChannelsForGroup(...args),
  createChannel: (...args: unknown[]) => mockCreateChannel(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    GROUP_DETAIL: { maxRequests: 60, windowMs: 60_000 },
    GROUP_CHANNEL: { maxRequests: 5, windowMs: 60_000 },
  },
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000, limit: 10 }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { GET, POST } from "./route";
import { ApiError } from "@/lib/api-error";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const GROUP_ID = "00000000-0000-4000-8000-000000000002";
const CHANNEL_ID = "00000000-0000-4000-8000-000000000003";
const BASE_URL = `https://localhost:3000/api/v1/groups/${GROUP_ID}/channels`;
const CSRF_HEADERS = { Host: "localhost:3000", Origin: "https://localhost:3000" };

const MOCK_CHANNEL = {
  id: CHANNEL_ID,
  groupId: GROUP_ID,
  name: "Events",
  description: null,
  isDefault: false,
  createdBy: USER_ID,
  createdAt: new Date().toISOString(),
  conversationId: "00000000-0000-4000-8000-000000000005",
};

beforeEach(() => {
  mockRequireAuthenticatedSession.mockReset();
  mockGetGroupMember.mockReset();
  mockListChannelsForGroup.mockReset();
  mockCreateChannel.mockReset();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID, role: "MEMBER" });
});

describe("GET /api/v1/groups/[groupId]/channels", () => {
  it("returns 200 with channels for active member", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "member", status: "active" });
    mockListChannelsForGroup.mockResolvedValue([MOCK_CHANNEL]);

    const req = new Request(BASE_URL);
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.channels).toHaveLength(1);
    expect(body.data.channels[0].name).toBe("Events");
  });

  it("returns 403 for non-member", async () => {
    mockGetGroupMember.mockResolvedValue(null);

    const req = new Request(BASE_URL);
    const res = await GET(req);

    expect(res.status).toBe(403);
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

describe("POST /api/v1/groups/[groupId]/channels", () => {
  const validBody = { name: "Events" };

  it("returns 201 for leader creating a channel", async () => {
    mockCreateChannel.mockResolvedValue(MOCK_CHANNEL);

    const req = new Request(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...CSRF_HEADERS },
      body: JSON.stringify(validBody),
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.channel.name).toBe("Events");
  });

  it("returns 403 for non-leader", async () => {
    mockCreateChannel.mockRejectedValue(
      new ApiError({ status: 403, title: "Forbidden", detail: "Only leaders can create channels" }),
    );

    const req = new Request(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...CSRF_HEADERS },
      body: JSON.stringify(validBody),
    });
    const res = await POST(req);

    expect(res.status).toBe(403);
  });

  it("returns 422 when at max channels", async () => {
    mockCreateChannel.mockRejectedValue(
      new ApiError({
        status: 422,
        title: "Unprocessable Entity",
        detail: "Maximum channels reached",
      }),
    );

    const req = new Request(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...CSRF_HEADERS },
      body: JSON.stringify(validBody),
    });
    const res = await POST(req);

    expect(res.status).toBe(422);
  });

  it("returns 422 for invalid body (empty name)", async () => {
    const req = new Request(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...CSRF_HEADERS },
      body: JSON.stringify({ name: "" }),
    });
    const res = await POST(req);

    expect(res.status).toBe(422);
  });
});
