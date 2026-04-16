// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/db/queries/portal-seeker-profiles");
vi.mock("@igbo/db/queries/portal-job-postings");
vi.mock("@igbo/db/queries/portal-applications");
vi.mock("@igbo/db/queries/portal-seeker-cvs");
vi.mock("@igbo/db/schema/portal-applications", () => ({
  portalApplications: { id: "pa_id" },
  portalApplicationTransitions: { id: "pat_id" },
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
import { installMockTransaction } from "@/test/mock-transaction";
import { seekerProfileFactory, applicationFactory } from "@/test/factories";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const SEEKER_PROFILE = seekerProfileFactory({
  id: "profile-1",
  userId: "seeker-1",
  headline: "Engineer",
  visibility: "active",
});

const JOB = {
  id: "jp-1",
  status: "active" as const,
  applicationDeadline: null,
  enableCoverLetter: false,
  companyId: "cp-1",
  employerUserId: "employer-1",
};

const APPLICATION: PortalApplication = applicationFactory({
  id: "app-1",
  jobId: "jp-1",
  seekerUserId: "seeker-1",
});

const BASE_INPUT = {
  jobId: "jp-1",
  seekerUserId: "seeker-1",
  selectedCvId: null,
  coverLetterText: null,
  portfolioLinks: [],
  idempotencyKey: null,
};

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
  installMockTransaction({ insertReturning: [APPLICATION] });
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

  it("inserts initial submitted→submitted transition inside transaction", async () => {
    makeRedisMock();
    const insertSpy = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue(
        Object.assign(Promise.resolve(undefined), {
          returning: vi.fn().mockResolvedValue([APPLICATION]),
        }),
      ),
    });
    installMockTransaction({ tx: { insert: insertSpy } });
    await submit(BASE_INPUT);
    // First call: portalApplications; second call: portalApplicationTransitions
    expect(insertSpy).toHaveBeenCalledTimes(2);
    // Both inserts share the same mock return value, so values.mock.calls[1] is the transition
    const sharedValues = insertSpy.mock.results[0]?.value?.values;
    const transitionValues = sharedValues?.mock?.calls[1]?.[0];
    expect(transitionValues).toMatchObject({
      applicationId: APPLICATION.id,
      fromStatus: "submitted",
      toStatus: "submitted",
      actorRole: "job_seeker",
    });
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

  it("does NOT throw when deadline is today (UTC midnight — deadline day still open)", async () => {
    const todayMidnightUTC = new Date();
    todayMidnightUTC.setUTCHours(0, 0, 0, 0);
    vi.mocked(getJobPostingForApply).mockResolvedValue({
      ...JOB,
      applicationDeadline: todayMidnightUTC,
    });
    makeRedisMock();
    const result = await submit(BASE_INPUT);
    expect(result.replayed).toBe(false);
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

// ---------------------------------------------------------------------------
// Re-apply after withdrawal (AC-8 integration lock — P-2.7)
//
// Where AC-8 is actually enforced (non-trivial — read this before editing):
//   1. **DB partial unique index** in migration 0063:
//        UNIQUE (job_id, seeker_user_id) WHERE status <> 'withdrawn'
//      The DB physically permits multiple rows for the same (job, seeker) as
//      long as only one is non-withdrawn at a time.
//   2. **`getExistingActiveApplication`** uses `ne(status, 'withdrawn')` —
//      proven by the unit test in
//      `packages/db/src/queries/portal-applications.test.ts`
//      ("returns null when only withdrawn application exists").
//   3. **`application-submission-service.submit`** does NOT pre-check for
//      existing rows on the happy path. It relies on (1) the DB unique index
//      and (2) the SET-NX idempotency key. `getExistingActiveApplication` is
//      only consulted inside the idempotency-replay branch (Step 6).
//
// These service-level tests therefore prove the *behavioural* contract: when
// no active application exists for (job, seeker) — which is exactly the state
// after a prior withdrawal — submission produces a brand-new row whose id is
// distinct from the prior withdrawn row's id, with a fresh `submitted` status,
// and emits `application.submitted` so the employer is notified afresh. The
// dedup short-circuit in Step 6 must NOT misfire.
// ---------------------------------------------------------------------------
describe("submit — re-apply after withdrawal (AC-8)", () => {
  const PRIOR_WITHDRAWN_APPLICATION: PortalApplication = {
    ...APPLICATION,
    id: "app-old-withdrawn",
    status: "withdrawn",
    previousStatus: "submitted",
    transitionedAt: new Date("2026-02-01"),
    transitionedByUserId: "seeker-1",
    transitionReason: "Changed my mind",
    createdAt: new Date("2026-01-15"),
    updatedAt: new Date("2026-02-01"),
  };

  it("creates a fresh application row distinct from the prior withdrawn row", async () => {
    makeRedisMock();

    const freshApplication: PortalApplication = {
      ...APPLICATION,
      id: "app-fresh-after-withdraw",
      status: "submitted",
      previousStatus: null,
      transitionedAt: null,
      transitionedByUserId: null,
      transitionReason: null,
      createdAt: new Date("2026-04-09"),
      updatedAt: new Date("2026-04-09"),
    };
    installMockTransaction({ insertReturning: [freshApplication] });

    const result = await submit(BASE_INPUT);

    // The new row is genuinely new — not a resurrection of the prior withdrawn row
    expect(result.application.id).toBe("app-fresh-after-withdraw");
    expect(result.application.id).not.toBe(PRIOR_WITHDRAWN_APPLICATION.id);
    expect(result.application.status).toBe("submitted");
    expect(result.application.previousStatus).toBeNull();
    expect(result.replayed).toBe(false);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    // The application.submitted event must fire on a re-apply (employer needs
    // a fresh notification, not silence because "they applied before")
    expect(portalEventBus.emit).toHaveBeenCalledWith(
      "application.submitted",
      expect.objectContaining({
        applicationId: "app-fresh-after-withdraw",
        jobId: "jp-1",
        seekerUserId: "seeker-1",
      }),
    );
  });

  it("does NOT take the replayed branch when an idempotency key is supplied for a re-apply attempt", async () => {
    // Regression guard: a fresh idempotency key on a re-apply attempt must
    // open a new transaction. The replayed branch is reserved for the
    // SET-NX-fail-AND-existing-row case (idempotent retry of the SAME request).
    makeRedisMock(); // SET NX returns "OK" — fresh key
    installMockTransaction({ insertReturning: [APPLICATION] });

    const result = await submit({ ...BASE_INPUT, idempotencyKey: "key-after-withdraw" });

    expect(result.replayed).toBe(false);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(portalEventBus.emit).toHaveBeenCalledWith("application.submitted", expect.any(Object));
  });

  it("re-apply does NOT consult getExistingActiveApplication on the happy path", async () => {
    // Documents the actual architecture: the gate query is only used inside
    // the idempotency replay branch. The DB partial unique index (migration
    // 0063) is what physically enforces "at most one non-withdrawn row per
    // (job, seeker)". If a future refactor introduces a service-level
    // pre-check, this test will fail and force a re-evaluation of the
    // dedup contract.
    makeRedisMock();
    installMockTransaction({ insertReturning: [APPLICATION] });

    await submit(BASE_INPUT);

    expect(getExistingActiveApplication).not.toHaveBeenCalled();
  });
});
