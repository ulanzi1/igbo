// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/services/permissions", () => ({
  canCreateEvent: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock("@/services/event-bus", () => ({
  eventBus: { emit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/services/daily-video-service", () => ({
  dailyVideoService: {
    createMeeting: vi.fn(),
    getMeetingToken: vi.fn(),
  },
}));

const mockGetEventById = vi.fn();
const mockGetAttendeeStatus = vi.fn();

vi.mock("@igbo/db/queries/events", () => ({
  createEvent: vi.fn(),
  updateEvent: vi.fn().mockResolvedValue({}),
  cancelEvent: vi.fn(),
  getEventById: (...args: unknown[]) => mockGetEventById(...args),
  rsvpToEvent: vi.fn(),
  cancelRsvp: vi.fn(),
  cancelAllEventRsvps: vi.fn(),
  getAttendeeStatus: (...args: unknown[]) => mockGetAttendeeStatus(...args),
  markAttended: vi.fn(),
  listEventAttendees: vi.fn(),
}));

vi.mock("@igbo/db/queries/auth-permissions", () => ({
  getUserMembershipTier: vi.fn(),
}));

vi.mock("@igbo/db/queries/groups", () => ({
  getUserPlatformRole: vi.fn(),
}));

vi.mock("@igbo/db/queries/platform-settings", () => ({
  getPlatformSetting: vi.fn(),
}));

vi.mock("@/lib/s3-client", () => ({
  getS3Client: vi.fn().mockReturnValue({}),
}));

vi.mock("@aws-sdk/client-s3", () => ({
  // GetObjectCommand is instantiated with `new`, so the mock must be a constructor
  GetObjectCommand: vi.fn(function GetObjectCommand(
    this: Record<string, unknown>,
    args: Record<string, unknown>,
  ) {
    Object.assign(this, args);
  }),
  S3Client: vi.fn(),
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: {
    HETZNER_S3_BUCKET: "test-bucket",
    HETZNER_S3_ENDPOINT: "https://s3.example.com",
    HETZNER_S3_REGION: "eu-central-1",
    HETZNER_S3_ACCESS_KEY_ID: "key",
    HETZNER_S3_SECRET_ACCESS_KEY: "secret",
  },
}));

// Mock for dynamic imports used in preserveRecording
const mockDbSelect = vi.fn();
const mockDbUpdate = vi.fn();

vi.mock("@igbo/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    update: (...args: unknown[]) => mockDbUpdate(...args),
  },
}));

vi.mock("@igbo/db/schema/community-events", () => ({
  communityEvents: { id: "id", recordingExpiresAt: "recording_expires_at" },
  recordingStatusEnum: { enumValues: ["pending", "mirroring", "ready", "lost"] },
}));

vi.mock("drizzle-orm", () => ({
  sql: Object.assign(
    vi.fn((_parts: unknown, ..._vals: unknown[]) => ({})),
    {
      raw: vi.fn((s: string) => s),
    },
  ),
  isNull: vi.fn((_col: unknown) => ({})),
  eq: vi.fn((_col: unknown, _val: unknown) => ({})),
  and: vi.fn((..._args: unknown[]) => ({})),
  lte: vi.fn((_col: unknown, _val: unknown) => ({})),
  inArray: vi.fn((_col: unknown, _vals: unknown) => ({})),
  asc: vi.fn((_col: unknown) => ({})),
}));

import {
  getRecordingPlaybackUrl,
  getRecordingDownloadUrl,
  preserveRecording,
} from "./event-service";
import { getUserMembershipTier } from "@igbo/db/queries/auth-permissions";
import { getUserPlatformRole } from "@igbo/db/queries/groups";
import { getPlatformSetting } from "@igbo/db/queries/platform-settings";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const EVENT_ID = "event-abc";
const USER_ID = "user-xyz";
const CREATOR_ID = "creator-123";
const MIRROR_URL = "https://s3.example.com/recordings/event-abc/recording.mp4";

const baseEvent = {
  id: EVENT_ID,
  creatorId: CREATOR_ID,
  status: "past",
  recordingStatus: "ready",
  recordingUrl: "https://download.daily.co/rec.mp4",
  recordingMirrorUrl: MIRROR_URL,
  recordingExpiresAt: new Date("2026-06-01T00:00:00Z"),
  recordingSizeBytes: 100_000_000,
};

beforeEach(() => {
  mockGetEventById.mockReset();
  mockGetAttendeeStatus.mockReset();
  mockDbSelect.mockReset();
  mockDbUpdate.mockReset();
  vi.mocked(getUserMembershipTier).mockReset();
  vi.mocked(getUserPlatformRole).mockReset();
  vi.mocked(getPlatformSetting).mockReset();
  vi.mocked(getSignedUrl).mockReset();

  mockGetEventById.mockResolvedValue(baseEvent);
  mockGetAttendeeStatus.mockResolvedValue({ status: "registered", waitlistPosition: null });
  vi.mocked(getUserMembershipTier).mockResolvedValue("TOP_TIER");
  vi.mocked(getUserPlatformRole).mockResolvedValue("MEMBER");
  vi.mocked(getPlatformSetting).mockResolvedValue(53_687_091_200);
});

describe("getRecordingPlaybackUrl", () => {
  it("returns mirror URL and metadata for Top-tier registered user", async () => {
    const result = await getRecordingPlaybackUrl(USER_ID, EVENT_ID);
    expect(result.url).toBe(MIRROR_URL);
    expect(result.status).toBe("ready");
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.isPreserved).toBe(false);
  });

  it("falls back to source recording URL when no mirror URL", async () => {
    mockGetEventById.mockResolvedValue({ ...baseEvent, recordingMirrorUrl: null });
    const result = await getRecordingPlaybackUrl(USER_ID, EVENT_ID);
    expect(result.url).toBe(baseEvent.recordingUrl);
  });

  it("marks isPreserved=true when expiresAt is null and mirror URL exists", async () => {
    mockGetEventById.mockResolvedValue({ ...baseEvent, recordingExpiresAt: null });
    const result = await getRecordingPlaybackUrl(USER_ID, EVENT_ID);
    expect(result.isPreserved).toBe(true);
  });

  it("throws 404 when event not found", async () => {
    mockGetEventById.mockResolvedValue(null);
    await expect(getRecordingPlaybackUrl(USER_ID, EVENT_ID)).rejects.toMatchObject({ status: 404 });
  });

  it("throws 403 when user is not Top-tier", async () => {
    vi.mocked(getUserMembershipTier).mockResolvedValue("MEMBER");
    await expect(getRecordingPlaybackUrl(USER_ID, EVENT_ID)).rejects.toMatchObject({ status: 403 });
  });

  it("throws 403 when user is not registered or attended", async () => {
    mockGetAttendeeStatus.mockResolvedValue(null);
    await expect(getRecordingPlaybackUrl(USER_ID, EVENT_ID)).rejects.toMatchObject({ status: 403 });
  });

  it("throws 403 for waitlisted attendee", async () => {
    mockGetAttendeeStatus.mockResolvedValue({ status: "waitlisted", waitlistPosition: 1 });
    await expect(getRecordingPlaybackUrl(USER_ID, EVENT_ID)).rejects.toMatchObject({ status: 403 });
  });
});

describe("getRecordingDownloadUrl", () => {
  it("returns presigned URL for valid user with mirror URL", async () => {
    vi.mocked(getSignedUrl).mockResolvedValue(
      "https://presigned.example.com/download?X-Amz-Signature=abc",
    );
    const url = await getRecordingDownloadUrl(USER_ID, EVENT_ID);
    expect(url).toContain("presigned.example.com");
    expect(getSignedUrl).toHaveBeenCalledTimes(1);
  });

  it("throws 404 when no mirror URL is available", async () => {
    mockGetEventById.mockResolvedValue({ ...baseEvent, recordingMirrorUrl: null });
    await expect(getRecordingDownloadUrl(USER_ID, EVENT_ID)).rejects.toMatchObject({ status: 404 });
  });

  it("throws 403 when user is not Top-tier", async () => {
    vi.mocked(getUserMembershipTier).mockResolvedValue("MEMBER");
    await expect(getRecordingDownloadUrl(USER_ID, EVENT_ID)).rejects.toMatchObject({ status: 403 });
  });
});

describe("preserveRecording", () => {
  function mockSelectChain(total: number) {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ total }]),
      }),
    });
  }

  function mockUpdateChain() {
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });
  }

  beforeEach(() => {
    mockSelectChain(0); // no preserved recordings by default
    mockUpdateChain();
  });

  it("preserves recording when creator has quota available", async () => {
    await preserveRecording(CREATOR_ID, EVENT_ID);
    expect(mockDbUpdate).toHaveBeenCalledTimes(1);
    const setMock = mockDbUpdate.mock.results[0]!.value as { set: ReturnType<typeof vi.fn> };
    expect(setMock.set).toHaveBeenCalledWith(expect.objectContaining({ recordingExpiresAt: null }));
  });

  it("throws 404 when event not found", async () => {
    mockGetEventById.mockResolvedValue(null);
    await expect(preserveRecording(CREATOR_ID, EVENT_ID)).rejects.toMatchObject({ status: 404 });
  });

  it("throws 403 when non-creator is not admin", async () => {
    vi.mocked(getUserPlatformRole).mockResolvedValue("MEMBER");
    await expect(preserveRecording("other-user", EVENT_ID)).rejects.toMatchObject({ status: 403 });
  });

  it("throws 403 when non-creator admin is not Top-tier", async () => {
    vi.mocked(getUserMembershipTier).mockResolvedValue("BASIC");
    vi.mocked(getUserPlatformRole).mockResolvedValue("ADMIN");
    await expect(preserveRecording("other-user", EVENT_ID)).rejects.toMatchObject({ status: 403 });
  });

  it("allows admin with Top-tier to preserve another creator's recording", async () => {
    vi.mocked(getUserPlatformRole).mockResolvedValue("ADMIN");
    vi.mocked(getUserMembershipTier).mockResolvedValue("TOP_TIER");
    await preserveRecording("admin-user", EVENT_ID);
    expect(mockDbUpdate).toHaveBeenCalledTimes(1);
  });

  it("throws 404 when no mirror URL to preserve", async () => {
    mockGetEventById.mockResolvedValue({ ...baseEvent, recordingMirrorUrl: null });
    await expect(preserveRecording(CREATOR_ID, EVENT_ID)).rejects.toMatchObject({ status: 404 });
  });

  it("throws 422 when storage quota would be exceeded", async () => {
    const quotaBytes = 53_687_091_200;
    mockSelectChain(quotaBytes); // already at quota
    await expect(preserveRecording(CREATOR_ID, EVENT_ID)).rejects.toMatchObject({ status: 422 });
  });
});
