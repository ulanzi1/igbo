// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  mockGetUsersWithDigestDue,
  mockGetUndigestedPortalNotifications,
  mockMarkDigestSent,
  mockGetNotificationPreferences,
  mockFindUserById,
  mockEnqueueEmailJob,
} = vi.hoisted(() => ({
  mockGetUsersWithDigestDue: vi.fn(),
  mockGetUndigestedPortalNotifications: vi.fn(),
  mockMarkDigestSent: vi.fn(),
  mockGetNotificationPreferences: vi.fn(),
  mockFindUserById: vi.fn(),
  mockEnqueueEmailJob: vi.fn(),
}));

vi.mock("@igbo/db/queries/notification-preferences", () => ({
  getUsersWithDigestDue: mockGetUsersWithDigestDue,
  getUndigestedPortalNotifications: mockGetUndigestedPortalNotifications,
  markDigestSent: mockMarkDigestSent,
  getNotificationPreferences: mockGetNotificationPreferences,
}));

vi.mock("@igbo/db/queries/auth-queries", () => ({
  findUserById: mockFindUserById,
}));

vi.mock("@/services/email-service", () => ({
  enqueueEmailJob: mockEnqueueEmailJob,
}));

// ── Import under test ─────────────────────────────────────────────────────────

import { sendPendingDigests } from "./digest-sender";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NOW = new Date("2026-05-02T08:00:00.000Z");
const LAST_DIGEST = new Date("2026-05-01T08:00:00.000Z");
const USER_ID = "user-abc";
const USER_EMAIL = "ada@example.com";

const USER_EN = {
  id: USER_ID,
  email: USER_EMAIL,
  name: "Ada Okafor",
  languagePreference: "en",
};

const USER_IG = {
  id: USER_ID,
  email: USER_EMAIL,
  name: "Ada Okafor",
  languagePreference: "ig",
};

const SAVED_SEARCH_NOTIF = {
  id: "notif-1",
  title: "New search results",
  body: "3 new jobs matching 'software engineer'",
  link: "/saved-searches/search-1",
  idempotencyKey: "search-alert:search-1:job-1",
  createdAt: new Date("2026-05-01T12:00:00.000Z"),
};

const ACTIVITY_NOTIF = {
  id: "notif-2",
  title: "Application status changed",
  body: "Your application was reviewed",
  link: "/applications/app-1",
  idempotencyKey: "portal:notif:app-status:app-1:reviewed",
  createdAt: new Date("2026-05-01T14:00:00.000Z"),
};

const RECOMMENDATION_NOTIF = {
  id: "notif-3",
  title: "New job recommendation",
  body: "Senior Engineer at Acme Corp",
  link: "/jobs/job-1",
  idempotencyKey: "match-rec:job-1:user-abc",
  createdAt: new Date("2026-05-01T16:00:00.000Z"),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("sendPendingDigests()", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockMarkDigestSent.mockResolvedValue(undefined);
    mockEnqueueEmailJob.mockResolvedValue(true);
    mockGetNotificationPreferences.mockResolvedValue({
      "portal.saved_search.new_results": {
        digestMode: "daily",
        lastDigestAt: LAST_DIGEST,
      },
    });
  });

  it("returns zero stats when no users are due", async () => {
    mockGetUsersWithDigestDue.mockResolvedValue([]);

    const result = await sendPendingDigests(NOW);

    expect(result).toEqual({ processed: 0, emailsSent: 0, skipped: 0, errors: 0 });
    expect(mockEnqueueEmailJob).not.toHaveBeenCalled();
    expect(mockMarkDigestSent).not.toHaveBeenCalled();
  });

  it("sends digest email for user with pending saved-search notifications", async () => {
    mockGetUsersWithDigestDue.mockResolvedValue([
      { userId: USER_ID, digestTypes: ["portal.saved_search.new_results"] },
    ]);
    mockFindUserById.mockResolvedValue(USER_EN);
    mockGetUndigestedPortalNotifications.mockResolvedValue([SAVED_SEARCH_NOTIF]);

    const result = await sendPendingDigests(NOW);

    expect(result).toEqual({ processed: 1, emailsSent: 1, skipped: 0, errors: 0 });
    expect(mockEnqueueEmailJob).toHaveBeenCalledWith(
      `digest-${USER_ID}-2026-05-02`,
      expect.objectContaining({
        to: USER_EMAIL,
        templateId: "notification-digest",
        locale: "en",
        data: expect.objectContaining({
          seekerName: "Ada Okafor",
          savedSearches: [
            {
              title: SAVED_SEARCH_NOTIF.title,
              body: SAVED_SEARCH_NOTIF.body,
              link: SAVED_SEARCH_NOTIF.link,
            },
          ],
        }),
      }),
    );
    expect(mockMarkDigestSent).toHaveBeenCalledWith(
      USER_ID,
      ["portal.saved_search.new_results"],
      NOW,
    );
  });

  it("skips email but still advances watermark when user has zero pending items (AC #4)", async () => {
    mockGetUsersWithDigestDue.mockResolvedValue([
      { userId: USER_ID, digestTypes: ["portal.saved_search.new_results"] },
    ]);
    mockFindUserById.mockResolvedValue(USER_EN);
    mockGetUndigestedPortalNotifications.mockResolvedValue([]);

    const result = await sendPendingDigests(NOW);

    expect(result).toEqual({ processed: 1, emailsSent: 0, skipped: 1, errors: 0 });
    expect(mockEnqueueEmailJob).not.toHaveBeenCalled();
    // Watermark still advances
    expect(mockMarkDigestSent).toHaveBeenCalledWith(
      USER_ID,
      ["portal.saved_search.new_results"],
      NOW,
    );
  });

  it("deduplicates notifications with the same link (same entity)", async () => {
    const duplicate = { ...SAVED_SEARCH_NOTIF, id: "notif-1b" };
    mockGetUsersWithDigestDue.mockResolvedValue([
      { userId: USER_ID, digestTypes: ["portal.saved_search.new_results"] },
    ]);
    mockFindUserById.mockResolvedValue(USER_EN);
    // Two notifications with same link → deduped to one
    mockGetUndigestedPortalNotifications.mockResolvedValue([SAVED_SEARCH_NOTIF, duplicate]);

    const result = await sendPendingDigests(NOW);

    expect(result.emailsSent).toBe(1);
    expect(mockEnqueueEmailJob).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        data: expect.objectContaining({
          savedSearches: [
            {
              title: SAVED_SEARCH_NOTIF.title,
              body: SAVED_SEARCH_NOTIF.body,
              link: SAVED_SEARCH_NOTIF.link,
            },
          ],
        }),
      }),
    );
  });

  it("classifies notifications into sections by idempotencyKey prefix", async () => {
    mockGetUsersWithDigestDue.mockResolvedValue([
      {
        userId: USER_ID,
        digestTypes: [
          "portal.match.new_recommendations",
          "portal.saved_search.new_results",
          "portal.application.status_changed",
        ],
      },
    ]);
    mockFindUserById.mockResolvedValue(USER_EN);
    mockGetNotificationPreferences.mockResolvedValue({
      "portal.match.new_recommendations": { digestMode: "daily", lastDigestAt: LAST_DIGEST },
      "portal.saved_search.new_results": { digestMode: "daily", lastDigestAt: LAST_DIGEST },
      "portal.application.status_changed": { digestMode: "daily", lastDigestAt: LAST_DIGEST },
    });
    // All three notifications returned in single query, classified by idempotencyKey
    mockGetUndigestedPortalNotifications.mockResolvedValue([
      RECOMMENDATION_NOTIF,
      SAVED_SEARCH_NOTIF,
      ACTIVITY_NOTIF,
    ]);

    const result = await sendPendingDigests(NOW);

    expect(result.emailsSent).toBe(1);
    expect(mockGetUndigestedPortalNotifications).toHaveBeenCalledTimes(1);
    expect(mockEnqueueEmailJob).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        data: expect.objectContaining({
          recommendations: [expect.objectContaining({ link: RECOMMENDATION_NOTIF.link })],
          savedSearches: [expect.objectContaining({ link: SAVED_SEARCH_NOTIF.link })],
          activity: [expect.objectContaining({ link: ACTIVITY_NOTIF.link })],
        }),
      }),
    );
  });

  it("uses Igbo locale for users with ig language preference", async () => {
    mockGetUsersWithDigestDue.mockResolvedValue([
      { userId: USER_ID, digestTypes: ["portal.saved_search.new_results"] },
    ]);
    mockFindUserById.mockResolvedValue(USER_IG);
    mockGetUndigestedPortalNotifications.mockResolvedValue([SAVED_SEARCH_NOTIF]);

    await sendPendingDigests(NOW);

    expect(mockEnqueueEmailJob).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ locale: "ig" }),
    );
  });

  it("skips user with no email address", async () => {
    mockGetUsersWithDigestDue.mockResolvedValue([
      { userId: USER_ID, digestTypes: ["portal.saved_search.new_results"] },
    ]);
    mockFindUserById.mockResolvedValue({ ...USER_EN, email: null });

    const result = await sendPendingDigests(NOW);

    expect(result).toEqual({ processed: 1, emailsSent: 0, skipped: 1, errors: 0 });
    expect(mockEnqueueEmailJob).not.toHaveBeenCalled();
    expect(mockMarkDigestSent).not.toHaveBeenCalled();
  });

  it("counts error and continues to next user when an exception occurs", async () => {
    const USER_ID_2 = "user-xyz";
    mockGetUsersWithDigestDue.mockResolvedValue([
      { userId: USER_ID, digestTypes: ["portal.saved_search.new_results"] },
      { userId: USER_ID_2, digestTypes: ["portal.saved_search.new_results"] },
    ]);
    // First user throws
    mockFindUserById
      .mockRejectedValueOnce(new Error("DB timeout"))
      .mockResolvedValueOnce({ ...USER_EN, id: USER_ID_2 });
    mockGetUndigestedPortalNotifications.mockResolvedValue([SAVED_SEARCH_NOTIF]);

    const result = await sendPendingDigests(NOW);

    expect(result).toEqual({ processed: 2, emailsSent: 1, skipped: 0, errors: 1 });
  });

  it("uses earliest lastDigestAt across all due types as watermark", async () => {
    const EARLIER_DIGEST = new Date("2026-04-28T08:00:00.000Z");
    mockGetUsersWithDigestDue.mockResolvedValue([
      {
        userId: USER_ID,
        digestTypes: ["portal.saved_search.new_results", "portal.match.new_recommendations"],
      },
    ]);
    mockFindUserById.mockResolvedValue(USER_EN);
    mockGetNotificationPreferences.mockResolvedValue({
      "portal.saved_search.new_results": { digestMode: "daily", lastDigestAt: LAST_DIGEST },
      "portal.match.new_recommendations": { digestMode: "weekly", lastDigestAt: EARLIER_DIGEST },
    });
    mockGetUndigestedPortalNotifications.mockResolvedValue([SAVED_SEARCH_NOTIF]);

    await sendPendingDigests(NOW);

    // Should use the EARLIER watermark (from recommendations type)
    expect(mockGetUndigestedPortalNotifications).toHaveBeenCalledWith(USER_ID, EARLIER_DIGEST);
  });

  it("falls back to epoch (new Date(0)) when lastDigestAt is null (first digest)", async () => {
    mockGetUsersWithDigestDue.mockResolvedValue([
      { userId: USER_ID, digestTypes: ["portal.saved_search.new_results"] },
    ]);
    mockFindUserById.mockResolvedValue(USER_EN);
    mockGetNotificationPreferences.mockResolvedValue({
      "portal.saved_search.new_results": {
        digestMode: "daily",
        lastDigestAt: null,
      },
    });
    mockGetUndigestedPortalNotifications.mockResolvedValue([SAVED_SEARCH_NOTIF]);

    await sendPendingDigests(NOW);

    // Should fall back to epoch
    expect(mockGetUndigestedPortalNotifications).toHaveBeenCalledWith(USER_ID, new Date(0));
  });

  it("uses email as seekerName fallback when user has no name", async () => {
    mockGetUsersWithDigestDue.mockResolvedValue([
      { userId: USER_ID, digestTypes: ["portal.saved_search.new_results"] },
    ]);
    mockFindUserById.mockResolvedValue({ ...USER_EN, name: null });
    mockGetUndigestedPortalNotifications.mockResolvedValue([SAVED_SEARCH_NOTIF]);

    await sendPendingDigests(NOW);

    expect(mockEnqueueEmailJob).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        data: expect.objectContaining({ seekerName: USER_EMAIL }),
      }),
    );
  });

  it("processes multiple users independently", async () => {
    const USER_ID_2 = "user-def";
    mockGetUsersWithDigestDue.mockResolvedValue([
      { userId: USER_ID, digestTypes: ["portal.saved_search.new_results"] },
      { userId: USER_ID_2, digestTypes: ["portal.saved_search.new_results"] },
    ]);
    mockFindUserById
      .mockResolvedValueOnce(USER_EN)
      .mockResolvedValueOnce({ ...USER_EN, id: USER_ID_2, email: "kemi@example.com" });
    mockGetUndigestedPortalNotifications.mockResolvedValue([SAVED_SEARCH_NOTIF]);

    const result = await sendPendingDigests(NOW);

    expect(result).toEqual({ processed: 2, emailsSent: 2, skipped: 0, errors: 0 });
    expect(mockEnqueueEmailJob).toHaveBeenCalledTimes(2);
    expect(mockMarkDigestSent).toHaveBeenCalledTimes(2);
  });

  it("classifies notifications with null idempotencyKey as activity", async () => {
    const nullKeyNotif = {
      id: "notif-4",
      title: "Unknown notification",
      body: "Something happened",
      link: "/somewhere",
      idempotencyKey: null,
      createdAt: new Date("2026-05-01T15:00:00.000Z"),
    };
    mockGetUsersWithDigestDue.mockResolvedValue([
      { userId: USER_ID, digestTypes: ["portal.saved_search.new_results"] },
    ]);
    mockFindUserById.mockResolvedValue(USER_EN);
    mockGetUndigestedPortalNotifications.mockResolvedValue([nullKeyNotif]);

    await sendPendingDigests(NOW);

    expect(mockEnqueueEmailJob).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        data: expect.objectContaining({
          recommendations: [],
          savedSearches: [],
          activity: [
            { title: nullKeyNotif.title, body: nullKeyNotif.body, link: nullKeyNotif.link },
          ],
        }),
      }),
    );
  });
});
