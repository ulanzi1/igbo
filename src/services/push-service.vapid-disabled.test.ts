// @vitest-environment node
/**
 * Separate test file for VAPID-not-configured path.
 * vapidConfigured is set at module load — must be in its own module scope
 * with empty VAPID env vars to test the early-return path.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockSetVapidDetails = vi.hoisted(() => vi.fn());
const mockSendNotification = vi.hoisted(() => vi.fn().mockResolvedValue({}));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: mockSetVapidDetails,
    sendNotification: mockSendNotification,
  },
}));

const mockGetUserPushSubscriptions = vi.hoisted(() => vi.fn());
const mockDeletePushSubscriptionByEndpoint = vi.hoisted(() => vi.fn());

vi.mock("@/db/queries/push-subscriptions", () => ({
  getUserPushSubscriptions: (...args: unknown[]) => mockGetUserPushSubscriptions(...args),
  deletePushSubscriptionByEndpoint: (...args: unknown[]) =>
    mockDeletePushSubscriptionByEndpoint(...args),
}));

// Empty VAPID keys → vapidConfigured = false
vi.mock("@/env", () => ({
  env: {
    VAPID_CONTACT_EMAIL: "",
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: "",
    VAPID_PRIVATE_KEY: "",
  },
}));

import { sendPushNotifications } from "./push-service";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sendPushNotifications (VAPID not configured)", () => {
  it("returns early without DB call when VAPID vars are empty", async () => {
    await sendPushNotifications("user-1", {
      title: "Test",
      body: "Test body",
      icon: "/icon-192.png",
      link: "/dashboard",
    });

    expect(mockGetUserPushSubscriptions).not.toHaveBeenCalled();
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("does not call setVapidDetails when VAPID vars are empty", () => {
    expect(mockSetVapidDetails).not.toHaveBeenCalled();
  });
});
