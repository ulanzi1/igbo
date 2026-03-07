// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Mocks for recording service dependencies added in Story 7.4
vi.mock("@/env", () => ({
  env: {
    HETZNER_S3_BUCKET: "test-bucket",
    HETZNER_S3_ENDPOINT: "https://s3.example.com",
    HETZNER_S3_REGION: "eu-central-1",
    HETZNER_S3_ACCESS_KEY_ID: "key",
    HETZNER_S3_SECRET_ACCESS_KEY: "secret",
    DAILY_WEBHOOK_SECRET: "",
  },
}));

vi.mock("@/lib/s3-client", () => ({
  getS3Client: vi.fn().mockReturnValue({}),
}));

vi.mock("@aws-sdk/client-s3", () => ({
  GetObjectCommand: vi.fn(function GetObjectCommand(
    this: Record<string, unknown>,
    args: Record<string, unknown>,
  ) {
    Object.assign(this, args);
  }),
  S3Client: vi.fn(),
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://presigned.example.com/download"),
}));

vi.mock("@/db/queries/auth-permissions", () => ({
  getUserMembershipTier: vi.fn().mockResolvedValue("TOP_TIER"),
}));

vi.mock("@/db/queries/groups", () => ({
  getUserPlatformRole: vi.fn().mockResolvedValue("MEMBER"),
}));

vi.mock("@/db/queries/platform-settings", () => ({
  getPlatformSetting: vi.fn().mockResolvedValue(53_687_091_200),
}));

vi.mock("@/services/permissions", () => ({
  canCreateEvent: vi.fn().mockResolvedValue({ allowed: true }),
  requireAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1" }),
}));

vi.mock("@/services/event-bus", () => ({
  eventBus: { emit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/services/daily-video-service", () => ({
  dailyVideoService: {
    createMeeting: vi
      .fn()
      .mockResolvedValue({ roomUrl: "https://igbo.daily.co/room", roomName: "room" }),
    getMeetingToken: vi.fn().mockResolvedValue({ token: "tok" }),
  },
}));

const mockGetEventById = vi.fn();
const mockGetAttendeeStatus = vi.fn();
const mockMarkAttended = vi.fn();
const mockListEventAttendees = vi.fn();

vi.mock("@/db/queries/events", () => ({
  createEvent: vi.fn(),
  updateEvent: vi.fn().mockResolvedValue({}),
  cancelEvent: vi.fn(),
  getEventById: (...args: unknown[]) => mockGetEventById(...args),
  rsvpToEvent: vi.fn(),
  cancelRsvp: vi.fn(),
  cancelAllEventRsvps: vi.fn(),
  getAttendeeStatus: (...args: unknown[]) => mockGetAttendeeStatus(...args),
  markAttended: (...args: unknown[]) => mockMarkAttended(...args),
  listEventAttendees: (...args: unknown[]) => mockListEventAttendees(...args),
}));

import { getJoinToken, markAttendance } from "./event-service";
import { eventBus } from "@/services/event-bus";

const EVENT_ID = "event-abc";
const USER_ID = "user-xyz";
const HOST_ID = "creator-123";

const baseEvent = {
  id: EVENT_ID,
  creatorId: HOST_ID,
  status: "upcoming",
  format: "virtual",
  meetingLink: "https://igbo.daily.co/igbo-evt-abc",
  startTime: new Date(Date.now() - 30 * 60 * 1000), // started 30min ago
  endTime: new Date(Date.now() + 60 * 60 * 1000), // ends in 1 hour
};

describe("getJoinToken", () => {
  beforeEach(() => {
    mockGetEventById.mockReset();
    mockGetAttendeeStatus.mockReset();
    mockGetEventById.mockResolvedValue(baseEvent);
    mockGetAttendeeStatus.mockResolvedValue({ status: "registered", waitlistPosition: null });
  });

  it("returns token and roomUrl for registered attendee", async () => {
    const result = await getJoinToken(USER_ID, EVENT_ID);
    expect(result.token).toBe("tok");
    expect(result.roomUrl).toBe("https://igbo.daily.co/igbo-evt-abc");
  });

  it("allows attended user to rejoin (attended status accepted)", async () => {
    mockGetAttendeeStatus.mockResolvedValue({ status: "attended", waitlistPosition: null });
    const result = await getJoinToken(USER_ID, EVENT_ID);
    expect(result.token).toBeDefined();
  });

  it("throws 404 when event not found", async () => {
    mockGetEventById.mockResolvedValue(null);
    await expect(getJoinToken(USER_ID, EVENT_ID)).rejects.toMatchObject({ status: 404 });
  });

  it("throws 403 when event is cancelled", async () => {
    mockGetEventById.mockResolvedValue({ ...baseEvent, status: "cancelled" });
    await expect(getJoinToken(USER_ID, EVENT_ID)).rejects.toMatchObject({ status: 403 });
  });

  it("throws 403 when user has no RSVP", async () => {
    mockGetAttendeeStatus.mockResolvedValue(null);
    await expect(getJoinToken(USER_ID, EVENT_ID)).rejects.toMatchObject({ status: 403 });
  });

  it("throws 403 when user is waitlisted (not registered/attended)", async () => {
    mockGetAttendeeStatus.mockResolvedValue({ status: "waitlisted", waitlistPosition: 1 });
    await expect(getJoinToken(USER_ID, EVENT_ID)).rejects.toMatchObject({ status: 403 });
  });

  it("throws 403 when event time window has not opened (starts in future)", async () => {
    mockGetEventById.mockResolvedValue({
      ...baseEvent,
      startTime: new Date(Date.now() + 2 * 60 * 60 * 1000), // starts in 2 hours (beyond 15-min window)
      endTime: new Date(Date.now() + 3 * 60 * 60 * 1000),
    });
    await expect(getJoinToken(USER_ID, EVENT_ID)).rejects.toMatchObject({ status: 403 });
  });

  it("throws 403 when event has ended", async () => {
    mockGetEventById.mockResolvedValue({
      ...baseEvent,
      startTime: new Date(Date.now() - 3 * 60 * 60 * 1000),
      endTime: new Date(Date.now() - 60 * 60 * 1000), // ended 1 hour ago
    });
    await expect(getJoinToken(USER_ID, EVENT_ID)).rejects.toMatchObject({ status: 403 });
  });

  it("throws 403 when event has no meeting link", async () => {
    mockGetEventById.mockResolvedValue({ ...baseEvent, meetingLink: null });
    await expect(getJoinToken(USER_ID, EVENT_ID)).rejects.toMatchObject({ status: 403 });
  });
});

describe("markAttendance", () => {
  beforeEach(() => {
    mockGetEventById.mockReset();
    mockMarkAttended.mockReset();
    vi.mocked(eventBus.emit).mockReset();
    mockGetEventById.mockResolvedValue(baseEvent);
    mockMarkAttended.mockResolvedValue({ alreadyAttended: false });
  });

  it("marks attendance and emits event.attended on first join", async () => {
    await markAttendance(USER_ID, EVENT_ID, "video");
    expect(mockMarkAttended).toHaveBeenCalledWith(EVENT_ID, USER_ID, expect.any(Date));
    expect(eventBus.emit).toHaveBeenCalledWith(
      "event.attended",
      expect.objectContaining({
        eventId: EVENT_ID,
        userId: USER_ID,
        hostId: HOST_ID, // AC 4: hostId = event.creatorId
      }),
    );
  });

  it("is idempotent — does NOT emit event.attended if already attended", async () => {
    mockMarkAttended.mockResolvedValue({ alreadyAttended: true });
    await markAttendance(USER_ID, EVENT_ID, "video");
    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  it("allows manual check-in when hostUserId === creatorId", async () => {
    await markAttendance(USER_ID, EVENT_ID, "manual", HOST_ID);
    expect(mockMarkAttended).toHaveBeenCalledWith(EVENT_ID, USER_ID, expect.any(Date));
  });

  it("throws 403 when manual source without hostUserId", async () => {
    await expect(markAttendance(USER_ID, EVENT_ID, "manual")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("throws 403 when manual source with wrong hostUserId (not creator)", async () => {
    await expect(
      markAttendance(USER_ID, EVENT_ID, "manual", "not-the-creator"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("throws 404 when event not found", async () => {
    mockGetEventById.mockResolvedValue(null);
    await expect(markAttendance(USER_ID, EVENT_ID, "video")).rejects.toMatchObject({ status: 404 });
  });
});
