// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/db/queries/portal-applications");
vi.mock("@igbo/db/schema/portal-applications", () => ({
  portalApplications: {
    id: "pa_id",
    status: "pa_status",
    previousStatus: "pa_prev_status",
    transitionedAt: "pa_transitioned_at",
    transitionedByUserId: "pa_transitioned_by",
    transitionReason: "pa_transition_reason",
    updatedAt: "pa_updated_at",
  },
  portalApplicationTransitions: {
    id: "pat_id",
  },
}));
vi.mock("@igbo/db", () => ({
  db: {
    transaction: vi.fn(),
  },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ eq: [col, val] })),
}));
vi.mock("@/services/event-bus", () => ({
  portalEventBus: { emit: vi.fn() },
}));

import { db } from "@igbo/db";
import {
  getApplicationWithCurrentStatus,
  getTransitionHistory,
} from "@igbo/db/queries/portal-applications";
import { portalEventBus } from "@/services/event-bus";
import {
  transition,
  toActorRole,
  canAcceptApplications,
  getTransitionHistory as getTransitionHistoryReExport,
} from "./application-state-machine";
import type { PortalApplicationTransition } from "@igbo/db/schema/portal-applications";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------
const BASE_APP = {
  id: "app-1",
  status: "submitted" as const,
  jobId: "jp-1",
  seekerUserId: "seeker-1",
  companyId: "cp-1",
};

// ---------------------------------------------------------------------------
// Transaction mock helpers
// ---------------------------------------------------------------------------
type CapturedInsert = { table: unknown; values: unknown };
type CapturedUpdate = { table: unknown; set: unknown };

interface TxCapture {
  inserts: CapturedInsert[];
  updates: CapturedUpdate[];
}

function installTxMock(): TxCapture {
  const inserts: CapturedInsert[] = [];
  const updates: CapturedUpdate[] = [];

  const tx = {
    insert: (table: unknown) => ({
      values: (data: unknown) => {
        inserts.push({ table, values: data });
        return Promise.resolve(undefined);
      },
    }),
    update: (table: unknown) => ({
      set: (data: unknown) => {
        updates.push({ table, set: data });
        return {
          where: () => Promise.resolve(undefined),
        };
      },
    }),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock transaction callback typing
  vi.mocked(db.transaction).mockImplementation(async (fn: any) => fn(tx));
  return { inserts, updates };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// canAcceptApplications
// ---------------------------------------------------------------------------
describe("canAcceptApplications", () => {
  it("returns true for active job status", () => {
    expect(canAcceptApplications("active")).toBe(true);
  });

  it("returns false for draft job status", () => {
    expect(canAcceptApplications("draft")).toBe(false);
  });

  it("returns false for paused job status", () => {
    expect(canAcceptApplications("paused")).toBe(false);
  });

  it("returns false for filled job status (terminal for jobs)", () => {
    expect(canAcceptApplications("filled")).toBe(false);
  });

  it("returns false for expired job status", () => {
    expect(canAcceptApplications("expired")).toBe(false);
  });

  it("returns false for pending_review job status", () => {
    expect(canAcceptApplications("pending_review")).toBe(false);
  });

  it("returns false for rejected job status", () => {
    expect(canAcceptApplications("rejected")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// toActorRole
// ---------------------------------------------------------------------------
describe("toActorRole", () => {
  it("maps JOB_SEEKER to job_seeker", () => {
    expect(toActorRole("JOB_SEEKER")).toBe("job_seeker");
  });

  it("maps EMPLOYER to employer", () => {
    expect(toActorRole("EMPLOYER")).toBe("employer");
  });

  it("maps JOB_ADMIN to job_admin", () => {
    expect(toActorRole("JOB_ADMIN")).toBe("job_admin");
  });

  it("throws 403 ApiError for unknown role string", () => {
    expect(() => toActorRole("UNKNOWN_ROLE")).toThrow();
  });

  it("throws 403 ApiError for empty string", () => {
    expect(() => toActorRole("")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// transition — application not found
// ---------------------------------------------------------------------------
describe("transition — application not found", () => {
  it("throws 404 ApiError when application does not exist", async () => {
    vi.mocked(getApplicationWithCurrentStatus).mockResolvedValue(null);

    await expect(
      transition("non-existent", "under_review", "employer-1", "employer"),
    ).rejects.toMatchObject({ status: 404 });

    expect(db.transaction).not.toHaveBeenCalled();
    expect(portalEventBus.emit).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// transition — terminal state guard (AC-8)
// ---------------------------------------------------------------------------
describe("transition — terminal state guard", () => {
  it("throws 409 when application is in hired terminal state", async () => {
    vi.mocked(getApplicationWithCurrentStatus).mockResolvedValue({
      ...BASE_APP,
      status: "hired",
    });

    await expect(
      transition("app-1", "under_review", "employer-1", "employer"),
    ).rejects.toMatchObject({
      status: 409,
      extensions: { code: "PORTAL_ERRORS.INVALID_STATUS_TRANSITION" },
    });
    expect(db.transaction).not.toHaveBeenCalled();
    expect(portalEventBus.emit).not.toHaveBeenCalled();
  });

  it("throws 409 when application is in rejected terminal state", async () => {
    vi.mocked(getApplicationWithCurrentStatus).mockResolvedValue({
      ...BASE_APP,
      status: "rejected",
    });

    await expect(transition("app-1", "submitted", "employer-1", "employer")).rejects.toMatchObject({
      status: 409,
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("throws 409 when application is in withdrawn terminal state", async () => {
    vi.mocked(getApplicationWithCurrentStatus).mockResolvedValue({
      ...BASE_APP,
      status: "withdrawn",
    });

    await expect(transition("app-1", "submitted", "seeker-1", "job_seeker")).rejects.toMatchObject({
      status: 409,
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// transition — invalid status transition (AC-4)
// ---------------------------------------------------------------------------
describe("transition — invalid status transition", () => {
  it("rejects submitted → hired (skipping intermediate states)", async () => {
    vi.mocked(getApplicationWithCurrentStatus).mockResolvedValue(BASE_APP);

    await expect(transition("app-1", "hired", "employer-1", "employer")).rejects.toMatchObject({
      status: 409,
      extensions: { code: "PORTAL_ERRORS.INVALID_STATUS_TRANSITION" },
    });
    expect(db.transaction).not.toHaveBeenCalled();
    expect(portalEventBus.emit).not.toHaveBeenCalled();
  });

  it("rejects submitted → shortlisted (skipping under_review)", async () => {
    vi.mocked(getApplicationWithCurrentStatus).mockResolvedValue(BASE_APP);

    await expect(
      transition("app-1", "shortlisted", "employer-1", "employer"),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("rejects under_review → offered (skipping shortlisted and interview)", async () => {
    vi.mocked(getApplicationWithCurrentStatus).mockResolvedValue({
      ...BASE_APP,
      status: "under_review",
    });

    await expect(transition("app-1", "offered", "employer-1", "employer")).rejects.toMatchObject({
      status: 409,
    });
  });

  it("rejects interview → hired (must go through offered first)", async () => {
    vi.mocked(getApplicationWithCurrentStatus).mockResolvedValue({
      ...BASE_APP,
      status: "interview",
    });

    await expect(transition("app-1", "hired", "employer-1", "employer")).rejects.toMatchObject({
      status: 409,
    });
  });
});

// ---------------------------------------------------------------------------
// transition — wrong actor role (AC-4)
// ---------------------------------------------------------------------------
describe("transition — wrong actor role rejected", () => {
  it("rejects seeker trying to shortlist (employer-only transition)", async () => {
    vi.mocked(getApplicationWithCurrentStatus).mockResolvedValue({
      ...BASE_APP,
      status: "under_review",
    });

    await expect(
      transition("app-1", "shortlisted", "seeker-1", "job_seeker"),
    ).rejects.toMatchObject({
      status: 409,
      extensions: { code: "PORTAL_ERRORS.INVALID_STATUS_TRANSITION" },
    });
    expect(db.transaction).not.toHaveBeenCalled();
    expect(portalEventBus.emit).not.toHaveBeenCalled();
  });

  it("rejects employer trying to withdraw (seeker-only transition)", async () => {
    vi.mocked(getApplicationWithCurrentStatus).mockResolvedValue(BASE_APP);

    await expect(transition("app-1", "withdrawn", "employer-1", "employer")).rejects.toMatchObject({
      status: 409,
    });
  });

  it("rejects job_admin from doing seeker-only withdrawal", async () => {
    vi.mocked(getApplicationWithCurrentStatus).mockResolvedValue(BASE_APP);

    await expect(transition("app-1", "withdrawn", "admin-1", "job_admin")).rejects.toMatchObject({
      status: 409,
    });
  });
});

// ---------------------------------------------------------------------------
// transition — valid employer transitions (AC-4, AC-5, AC-6)
// ---------------------------------------------------------------------------
describe("transition — valid employer transitions", () => {
  it("transitions submitted → under_review, inserts DB rows atomically, emits status_changed", async () => {
    vi.mocked(getApplicationWithCurrentStatus).mockResolvedValue(BASE_APP);
    const cap = installTxMock();

    await transition("app-1", "under_review", "employer-1", "employer");

    // TX was used
    expect(db.transaction).toHaveBeenCalledTimes(1);

    // DB update and insert both executed inside the tx
    expect(cap.updates).toHaveLength(1);
    expect(cap.updates[0]?.set).toMatchObject({
      status: "under_review",
      previousStatus: "submitted",
      transitionedAt: expect.any(Date),
      transitionedByUserId: "employer-1",
      transitionReason: null,
      updatedAt: expect.any(Date),
    });
    expect(cap.inserts).toHaveLength(1);
    expect(cap.inserts[0]?.values).toMatchObject({
      applicationId: "app-1",
      fromStatus: "submitted",
      toStatus: "under_review",
      actorUserId: "employer-1",
      actorRole: "employer",
    });

    // Event emitted after commit
    expect(portalEventBus.emit).toHaveBeenCalledTimes(1);
    expect(portalEventBus.emit).toHaveBeenCalledWith("application.status_changed", {
      applicationId: "app-1",
      jobId: "jp-1",
      seekerUserId: "seeker-1",
      companyId: "cp-1",
      previousStatus: "submitted",
      newStatus: "under_review",
      actorUserId: "employer-1",
      actorRole: "employer",
    });
  });

  it("transitions under_review → shortlisted with correct event payload", async () => {
    vi.mocked(getApplicationWithCurrentStatus).mockResolvedValue({
      ...BASE_APP,
      status: "under_review",
    });
    installTxMock();

    await transition("app-1", "shortlisted", "employer-1", "employer");

    expect(portalEventBus.emit).toHaveBeenCalledWith(
      "application.status_changed",
      expect.objectContaining({
        previousStatus: "under_review",
        newStatus: "shortlisted",
      }),
    );
  });

  it("transitions shortlisted → interview", async () => {
    vi.mocked(getApplicationWithCurrentStatus).mockResolvedValue({
      ...BASE_APP,
      status: "shortlisted",
    });
    installTxMock();

    await transition("app-1", "interview", "employer-1", "employer");

    expect(portalEventBus.emit).toHaveBeenCalledWith(
      "application.status_changed",
      expect.objectContaining({
        previousStatus: "shortlisted",
        newStatus: "interview",
      }),
    );
  });

  it("transitions interview → offered", async () => {
    vi.mocked(getApplicationWithCurrentStatus).mockResolvedValue({
      ...BASE_APP,
      status: "interview",
    });
    installTxMock();

    await transition("app-1", "offered", "employer-1", "employer");

    expect(portalEventBus.emit).toHaveBeenCalledWith(
      "application.status_changed",
      expect.objectContaining({ newStatus: "offered" }),
    );
  });

  it("transitions offered → hired, emits status_changed (not withdrawn)", async () => {
    vi.mocked(getApplicationWithCurrentStatus).mockResolvedValue({
      ...BASE_APP,
      status: "offered",
    });
    installTxMock();

    await transition("app-1", "hired", "employer-1", "employer");

    expect(portalEventBus.emit).toHaveBeenCalledWith(
      "application.status_changed",
      expect.objectContaining({
        previousStatus: "offered",
        newStatus: "hired",
      }),
    );
  });

  it("transitions submitted → rejected by employer", async () => {
    vi.mocked(getApplicationWithCurrentStatus).mockResolvedValue(BASE_APP);
    installTxMock();

    await transition("app-1", "rejected", "employer-1", "employer");

    expect(portalEventBus.emit).toHaveBeenCalledWith(
      "application.status_changed",
      expect.objectContaining({ newStatus: "rejected" }),
    );
  });

  it("passes optional reason to transition insert", async () => {
    vi.mocked(getApplicationWithCurrentStatus).mockResolvedValue(BASE_APP);
    const cap = installTxMock();

    await transition("app-1", "rejected", "employer-1", "employer", "Not the right fit");

    expect(cap.inserts[0]?.values).toMatchObject({ reason: "Not the right fit" });
  });

  it("defaults reason to null when not provided", async () => {
    vi.mocked(getApplicationWithCurrentStatus).mockResolvedValue(BASE_APP);
    const cap = installTxMock();

    await transition("app-1", "under_review", "employer-1", "employer");

    expect(cap.inserts[0]?.values).toMatchObject({ reason: null });
  });
});

// ---------------------------------------------------------------------------
// transition — valid seeker withdrawal (AC-4, AC-5)
// ---------------------------------------------------------------------------
describe("transition — valid seeker withdrawal", () => {
  it("transitions submitted → withdrawn by seeker, emits application.withdrawn", async () => {
    vi.mocked(getApplicationWithCurrentStatus).mockResolvedValue(BASE_APP);
    const cap = installTxMock();

    await transition("app-1", "withdrawn", "seeker-1", "job_seeker");

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(cap.inserts[0]?.values).toMatchObject({
      fromStatus: "submitted",
      toStatus: "withdrawn",
      actorRole: "job_seeker",
    });

    // Must emit application.withdrawn (not status_changed)
    expect(portalEventBus.emit).toHaveBeenCalledWith("application.withdrawn", {
      applicationId: "app-1",
      jobId: "jp-1",
      seekerUserId: "seeker-1",
      companyId: "cp-1",
      previousStatus: "submitted",
      newStatus: "withdrawn",
      actorUserId: "seeker-1",
    });
  });

  it("transitions under_review → withdrawn by seeker", async () => {
    vi.mocked(getApplicationWithCurrentStatus).mockResolvedValue({
      ...BASE_APP,
      status: "under_review",
    });
    installTxMock();

    await transition("app-1", "withdrawn", "seeker-1", "job_seeker");

    expect(portalEventBus.emit).toHaveBeenCalledWith(
      "application.withdrawn",
      expect.objectContaining({
        previousStatus: "under_review",
        newStatus: "withdrawn",
        actorUserId: "seeker-1",
      }),
    );
  });

  it("does NOT emit application.status_changed for withdrawal", async () => {
    vi.mocked(getApplicationWithCurrentStatus).mockResolvedValue(BASE_APP);
    installTxMock();

    await transition("app-1", "withdrawn", "seeker-1", "job_seeker");

    expect(portalEventBus.emit).not.toHaveBeenCalledWith(
      "application.status_changed",
      expect.anything(),
    );
  });

  it("seeker can withdraw from shortlisted", async () => {
    vi.mocked(getApplicationWithCurrentStatus).mockResolvedValue({
      ...BASE_APP,
      status: "shortlisted",
    });
    installTxMock();

    await transition("app-1", "withdrawn", "seeker-1", "job_seeker");

    expect(portalEventBus.emit).toHaveBeenCalledWith(
      "application.withdrawn",
      expect.objectContaining({
        previousStatus: "shortlisted",
        newStatus: "withdrawn",
        actorUserId: "seeker-1",
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// transition — event emitted ONLY after transaction commits (AC-7)
// ---------------------------------------------------------------------------
describe("transition — event emitted only after transaction commits", () => {
  it("does NOT emit event if transaction rolls back (throws)", async () => {
    vi.mocked(getApplicationWithCurrentStatus).mockResolvedValue(BASE_APP);
    vi.mocked(db.transaction).mockImplementation(async () => {
      throw new Error("DB connection lost");
    });

    await expect(transition("app-1", "under_review", "employer-1", "employer")).rejects.toThrow(
      "DB connection lost",
    );

    // Event must NOT have been emitted
    expect(portalEventBus.emit).not.toHaveBeenCalled();
  });

  it("emits event exactly once after successful transaction", async () => {
    vi.mocked(getApplicationWithCurrentStatus).mockResolvedValue(BASE_APP);
    installTxMock();

    await transition("app-1", "under_review", "employer-1", "employer");

    expect(portalEventBus.emit).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Full lifecycle traversal validation (AC: 6)
// ---------------------------------------------------------------------------
describe("transition — full lifecycle traversal", () => {
  it("completes submitted → under_review → shortlisted → interview → offered → hired", async () => {
    const statuses: Array<{ status: string; from: string; to: string }> = [
      { status: "submitted", from: "submitted", to: "under_review" },
      { status: "under_review", from: "under_review", to: "shortlisted" },
      { status: "shortlisted", from: "shortlisted", to: "interview" },
      { status: "interview", from: "interview", to: "offered" },
      { status: "offered", from: "offered", to: "hired" },
    ];

    for (const step of statuses) {
      vi.clearAllMocks();
      vi.mocked(getApplicationWithCurrentStatus).mockResolvedValue({
        ...BASE_APP,
        status: step.status as "submitted",
      });
      installTxMock();

      await transition("app-1", step.to as "under_review", "employer-1", "employer");

      expect(portalEventBus.emit).toHaveBeenCalledWith(
        "application.status_changed",
        expect.objectContaining({
          previousStatus: step.from,
          newStatus: step.to,
        }),
      );
    }
  });
});

// ---------------------------------------------------------------------------
// getTransitionHistory re-export (AC-7)
// ---------------------------------------------------------------------------
describe("getTransitionHistory re-export", () => {
  it("re-exports getTransitionHistory from @igbo/db/queries/portal-applications", async () => {
    const history: PortalApplicationTransition[] = [
      {
        id: "tr-1",
        applicationId: "app-1",
        fromStatus: "submitted",
        toStatus: "under_review",
        actorUserId: "employer-1",
        actorRole: "employer",
        reason: null,
        createdAt: new Date("2026-01-01"),
      },
    ];
    vi.mocked(getTransitionHistory).mockResolvedValue(history);

    const result = await getTransitionHistoryReExport("app-1");
    expect(result).toHaveLength(1);
    expect(result[0]?.fromStatus).toBe("submitted");
    expect(result[0]?.toStatus).toBe("under_review");
  });
});
