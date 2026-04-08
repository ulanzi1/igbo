// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/db/queries/portal-seeker-profiles");
vi.mock("@igbo/db/queries/portal-job-postings");
vi.mock("@igbo/db/queries/portal-applications");
vi.mock("@igbo/db/queries/portal-seeker-cvs");
vi.mock("@igbo/db/schema/portal-applications", () => ({
  portalApplications: { id: "pa_id" },
  canAcceptApplications: vi.fn(),
}));
vi.mock("@igbo/db", () => ({
  db: { transaction: vi.fn() },
}));
vi.mock("@/lib/redis", () => ({
  getRedisClient: vi.fn(),
}));
vi.mock("@/services/event-bus", () => ({
  portalEventBus: { emit: vi.fn() },
}));

import { db } from "@igbo/db";
import { canAcceptApplications } from "@igbo/db/schema/portal-applications";
import { getSeekerProfileByUserId } from "@igbo/db/queries/portal-seeker-profiles";
import { getJobPostingForApply } from "@igbo/db/queries/portal-job-postings";
import { getExistingActiveApplication } from "@igbo/db/queries/portal-applications";
import { listSeekerCvs } from "@igbo/db/queries/portal-seeker-cvs";
import { getRedisClient } from "@/lib/redis";
import { portalEventBus } from "@/services/event-bus";
import { submit } from "./application-submission-service";
import type { PortalApplication } from "@igbo/db/schema/portal-applications";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const SEEKER_PROFILE = {
  id: "profile-1",
  userId: "seeker-1",
  headline: "Engineer",
  summary: null,
  skills: [],
  experienceJson: [],
  educationJson: [],
  visibility: "active",
  consentMatching: false,
  consentEmployerView: false,
  consentMatchingChangedAt: null,
  consentEmployerViewChangedAt: null,
  onboardingCompletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const JOB = {
  id: "jp-1",
  status: "active" as const,
  applicationDeadline: null,
  enableCoverLetter: false,
  companyId: "cp-1",
  employerUserId: "employer-1",
};

const APPLICATION: PortalApplication = {
  id: "app-1",
  jobId: "jp-1",
  seekerUserId: "seeker-1",
  status: "submitted",
  previousStatus: null,
  transitionedAt: null,
  transitionedByUserId: null,
  transitionReason: null,
  selectedCvId: null,
  coverLetterText: null,
  portfolioLinksJson: [],
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const BASE_INPUT = {
  jobId: "jp-1",
  seekerUserId: "seeker-1",
  selectedCvId: null,
  coverLetterText: null,
  portfolioLinks: [],
  idempotencyKey: null,
};

// ---------------------------------------------------------------------------
// Transaction helper
// ---------------------------------------------------------------------------
function installTxMock(returnRow: PortalApplication | null) {
  const tx = {
    insert: (_table: unknown) => ({
      values: (_data: unknown) => ({
        returning: () => Promise.resolve(returnRow ? [returnRow] : []),
      }),
    }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(db.transaction).mockImplementation(async (fn: any) => fn(tx));
}

// ---------------------------------------------------------------------------
// Redis mock helper
// ---------------------------------------------------------------------------
function makeRedisMock({ setNxResult = "OK" as string | null } = {}) {
  const redis = {
    set: vi.fn().mockResolvedValue(setNxResult),
  };
  vi.mocked(getRedisClient).mockReturnValue(redis as unknown as ReturnType<typeof getRedisClient>);
  return redis;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(canAcceptApplications).mockReturnValue(true);
  vi.mocked(getSeekerProfileByUserId).mockResolvedValue(
    SEEKER_PROFILE as ReturnType<typeof getSeekerProfileByUserId> extends Promise<infer T>
      ? T
      : never,
  );
  vi.mocked(getJobPostingForApply).mockResolvedValue(JOB);
  vi.mocked(listSeekerCvs).mockResolvedValue([]);
  vi.mocked(getExistingActiveApplication).mockResolvedValue(null);
  installTxMock(APPLICATION);
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------
describe("submit — happy path", () => {
  it("creates and returns a new application", async () => {
    const redis = makeRedisMock();
    const result = await submit({ ...BASE_INPUT, idempotencyKey: "key-1" });
    expect(result.application).toEqual(APPLICATION);
    expect(result.replayed).toBe(false);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    // SET called twice: once for SET NX (step 6) and once to update value post-insert (step 8)
    expect(redis.set).toHaveBeenCalledTimes(2);
  });

  it("emits application.submitted event after transaction commits", async () => {
    makeRedisMock();
    await submit({ ...BASE_INPUT, idempotencyKey: "key-1" });
    expect(portalEventBus.emit).toHaveBeenCalledWith(
      "application.submitted",
      expect.objectContaining({
        applicationId: APPLICATION.id,
        jobId: "jp-1",
        seekerUserId: "seeker-1",
        companyId: "cp-1",
        employerUserId: "employer-1",
      }),
    );
  });

  it("does not set Redis key when idempotencyKey is null", async () => {
    const redis = makeRedisMock();
    await submit(BASE_INPUT);
    expect(redis.set).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Idempotent replay
// ---------------------------------------------------------------------------
describe("submit — idempotent replay (AC-6)", () => {
  it("returns existing application with replayed=true when SET NX fails (key exists)", async () => {
    makeRedisMock({ setNxResult: null }); // null = key already exists (SET NX failed)
    vi.mocked(getExistingActiveApplication).mockResolvedValue(APPLICATION);
    const result = await submit({ ...BASE_INPUT, idempotencyKey: "key-1" });
    expect(result.application).toEqual(APPLICATION);
    expect(result.replayed).toBe(true);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(portalEventBus.emit).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Precondition failures
// ---------------------------------------------------------------------------
describe("submit — missing seeker profile (AC-7)", () => {
  it("throws 409 SEEKER_PROFILE_REQUIRED when no profile exists", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(null);
    await expect(submit(BASE_INPUT)).rejects.toMatchObject({
      status: 409,
      extensions: { code: "PORTAL_ERRORS.SEEKER_PROFILE_REQUIRED" },
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

describe("submit — job not found (AC-4)", () => {
  it("throws 404 NOT_FOUND when job does not exist", async () => {
    vi.mocked(getJobPostingForApply).mockResolvedValue(null);
    await expect(submit(BASE_INPUT)).rejects.toMatchObject({ status: 404 });
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

describe("submit — job status not active (AC-4)", () => {
  it.each([
    ["paused", "paused"],
    ["expired", "expired"],
    ["filled", "filled"],
    ["pending_review", "pending_review"],
    ["draft", "draft"],
  ])("throws 409 APPROVAL_INTEGRITY_VIOLATION when status is '%s'", async (_label, status) => {
    vi.mocked(canAcceptApplications).mockReturnValue(false);
    vi.mocked(getJobPostingForApply).mockResolvedValue({ ...JOB, status: status as "active" });
    await expect(submit(BASE_INPUT)).rejects.toMatchObject({
      status: 409,
      extensions: expect.objectContaining({
        code: "PORTAL_ERRORS.APPROVAL_INTEGRITY_VIOLATION",
        reason: "job_not_active",
      }),
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

describe("submit — deadline passed (AC-5)", () => {
  it("throws 409 APPROVAL_INTEGRITY_VIOLATION with reason deadline_passed", async () => {
    vi.mocked(getJobPostingForApply).mockResolvedValue({
      ...JOB,
      applicationDeadline: new Date("2020-01-01"), // well in the past
    });
    await expect(submit(BASE_INPUT)).rejects.toMatchObject({
      status: 409,
      extensions: expect.objectContaining({
        code: "PORTAL_ERRORS.APPROVAL_INTEGRITY_VIOLATION",
        reason: "deadline_passed",
      }),
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("does NOT throw when deadline is null", async () => {
    vi.mocked(getJobPostingForApply).mockResolvedValue({ ...JOB, applicationDeadline: null });
    makeRedisMock();
    const result = await submit(BASE_INPUT);
    expect(result.replayed).toBe(false);
  });

  it("does NOT throw when deadline is in the future", async () => {
    const futureDate = new Date(Date.now() + 86400000 * 30);
    vi.mocked(getJobPostingForApply).mockResolvedValue({
      ...JOB,
      applicationDeadline: futureDate,
    });
    makeRedisMock();
    const result = await submit(BASE_INPUT);
    expect(result.replayed).toBe(false);
  });
});

describe("submit — CV ownership check", () => {
  it("throws 400 when CV does not belong to seeker", async () => {
    vi.mocked(listSeekerCvs).mockResolvedValue([
      { id: "cv-other", seekerProfileId: "profile-1", isDefault: false } as ReturnType<
        typeof listSeekerCvs
      > extends Promise<Array<infer T>>
        ? T
        : never,
    ]);
    await expect(submit({ ...BASE_INPUT, selectedCvId: "cv-missing" })).rejects.toMatchObject({
      status: 400,
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("succeeds when CV belongs to seeker", async () => {
    vi.mocked(listSeekerCvs).mockResolvedValue([
      { id: "cv-1", seekerProfileId: "profile-1", isDefault: true } as ReturnType<
        typeof listSeekerCvs
      > extends Promise<Array<infer T>>
        ? T
        : never,
    ]);
    makeRedisMock();
    const result = await submit({ ...BASE_INPUT, selectedCvId: "cv-1" });
    expect(result.replayed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unique violation → duplicate (AC-6)
// ---------------------------------------------------------------------------
describe("submit — unique-violation caught (AC-6)", () => {
  it("throws 409 DUPLICATE_APPLICATION when Postgres unique constraint fires", async () => {
    const pgUniqueError = Object.assign(new Error("duplicate key"), { code: "23505" });
    vi.mocked(db.transaction).mockRejectedValue(pgUniqueError);
    await expect(submit(BASE_INPUT)).rejects.toMatchObject({
      status: 409,
      extensions: { code: "PORTAL_ERRORS.DUPLICATE_APPLICATION" },
    });
    expect(portalEventBus.emit).not.toHaveBeenCalled();
  });

  it("re-throws non-unique errors unchanged", async () => {
    const otherError = new Error("connection reset");
    vi.mocked(db.transaction).mockRejectedValue(otherError);
    await expect(submit(BASE_INPUT)).rejects.toThrow("connection reset");
    expect(portalEventBus.emit).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Event NOT emitted on transaction failure (Playbook §8.3 Test 2)
// ---------------------------------------------------------------------------
describe("submit — event dedup / failure-retry (Playbook §8.3)", () => {
  it("does NOT emit event when transaction throws", async () => {
    vi.mocked(db.transaction).mockRejectedValue(new Error("DB timeout"));
    await expect(submit(BASE_INPUT)).rejects.toThrow("DB timeout");
    expect(portalEventBus.emit).not.toHaveBeenCalled();
  });

  it("emits event exactly once on clean submit (no duplicate emit)", async () => {
    makeRedisMock();
    await submit(BASE_INPUT);
    expect(portalEventBus.emit).toHaveBeenCalledTimes(1);
  });
});
