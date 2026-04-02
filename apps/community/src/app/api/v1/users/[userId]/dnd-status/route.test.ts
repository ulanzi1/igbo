// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

const mockIsUserInQuietHours = vi.fn().mockResolvedValue(false);
vi.mock("@igbo/db/queries/notification-preferences", () => ({
  isUserInQuietHours: (...args: unknown[]) => mockIsUserInQuietHours(...args),
}));

vi.mock("@/env", () => ({
  env: { DATABASE_URL: "postgres://localhost/test", DATABASE_POOL_SIZE: 1 },
}));

import { GET } from "./route";

function makeRequest(userId: string) {
  return new Request(`http://localhost/api/v1/users/${userId}/dnd-status`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsUserInQuietHours.mockResolvedValue(false);
});

describe("GET /api/v1/users/[userId]/dnd-status", () => {
  it("returns isDnd:false when user is not in quiet hours", async () => {
    mockIsUserInQuietHours.mockResolvedValue(false);
    const res = await GET(makeRequest("user-1"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.isDnd).toBe(false);
  });

  it("returns isDnd:true when user is in quiet hours", async () => {
    mockIsUserInQuietHours.mockResolvedValue(true);
    const res = await GET(makeRequest("user-1"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.isDnd).toBe(true);
  });

  it("returns isDnd:false when no quiet hours configured (no rows)", async () => {
    mockIsUserInQuietHours.mockResolvedValue(false);
    const res = await GET(makeRequest("user-no-prefs"));
    const json = await res.json();
    expect(json.data.isDnd).toBe(false);
  });

  it("passes userId to isUserInQuietHours", async () => {
    await GET(makeRequest("user-abc-123"));
    expect(mockIsUserInQuietHours).toHaveBeenCalledWith("user-abc-123", expect.any(Date));
  });
});
