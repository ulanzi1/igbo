// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", role: "MEMBER" }),
}));
vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));
vi.mock("@/db/queries/notification-preferences", () => ({
  getNotificationPreferences: vi.fn().mockResolvedValue({}),
  upsertNotificationPreference: vi.fn().mockResolvedValue(undefined),
  DEFAULT_PREFERENCES: {
    message: { inApp: true, email: true, push: true },
  },
}));

import { GET, PUT } from "./route";
import { requireAuthenticatedSession } from "@/services/permissions";
import {
  getNotificationPreferences,
  upsertNotificationPreference,
} from "@/db/queries/notification-preferences";
import { ApiError } from "@/lib/api-error";

const mockRequireAuth = vi.mocked(requireAuthenticatedSession);
const mockGetPrefs = vi.mocked(getNotificationPreferences);
const mockUpsert = vi.mocked(upsertNotificationPreference);

function makeGetRequest() {
  return new Request("http://localhost/api/v1/user/notification-preferences");
}

function makePutRequest(body: unknown) {
  return new Request("http://localhost/api/v1/user/notification-preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Host: "localhost", Origin: "http://localhost" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({ userId: "user-1", role: "MEMBER", tier: "BASIC" });
  mockGetPrefs.mockResolvedValue({});
  mockUpsert.mockResolvedValue(undefined);
});

describe("GET /api/v1/user/notification-preferences", () => {
  it("returns 401 when not authenticated", async () => {
    mockRequireAuth.mockRejectedValue(new ApiError({ status: 401, title: "Unauthorized" }));
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("returns preferences map for authenticated user", async () => {
    mockGetPrefs.mockResolvedValue({
      message: {
        channelInApp: true,
        channelEmail: true,
        channelPush: false,
        digestMode: "none",
        quietHoursStart: null,
        quietHoursEnd: null,
        quietHoursTimezone: "UTC",
        lastDigestAt: null,
      },
    });
    const res = await GET(makeGetRequest());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.preferences.message).toBeDefined();
    expect(json.data.preferences.message.channelEmail).toBe(true);
  });

  it("returns empty preferences when no rows", async () => {
    mockGetPrefs.mockResolvedValue({});
    const res = await GET(makeGetRequest());
    const json = await res.json();
    expect(json.data.preferences).toEqual({});
  });
});

describe("PUT /api/v1/user/notification-preferences", () => {
  it("returns 401 when not authenticated", async () => {
    mockRequireAuth.mockRejectedValue(new ApiError({ status: 401, title: "Unauthorized" }));
    const res = await PUT(makePutRequest({ notificationType: "message", channelEmail: false }));
    expect(res.status).toBe(401);
  });

  it("upserts preference and returns ok:true", async () => {
    const res = await PUT(
      makePutRequest({ notificationType: "message", channelEmail: false, digestMode: "daily" }),
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.ok).toBe(true);
    expect(mockUpsert).toHaveBeenCalledWith(
      "user-1",
      "message",
      expect.objectContaining({ channelEmail: false, digestMode: "daily" }),
    );
  });

  it("returns 400 for invalid notificationType", async () => {
    const res = await PUT(makePutRequest({ notificationType: "invalid_type" }));
    expect(res.status).toBe(400);
  });

  it("ignores channelInApp field (always on — non-configurable)", async () => {
    const res = await PUT(makePutRequest({ notificationType: "message", channelInApp: false }));
    const json = await res.json();
    expect(res.status).toBe(200);
    // channelInApp should NOT be passed to upsert
    expect(mockUpsert).toHaveBeenCalledWith(
      "user-1",
      "message",
      expect.not.objectContaining({ channelInApp: false }),
    );
  });

  it("returns 400 for invalid digestMode", async () => {
    const res = await PUT(makePutRequest({ notificationType: "message", digestMode: "monthly" }));
    expect(res.status).toBe(400);
  });
});
