// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@igbo/db/queries/portal-posting-reports", () => ({
  insertPostingReport: vi.fn(),
  getExistingActiveReportForUser: vi.fn(),
  resolveReportsForPosting: vi.fn(),
  dismissReportsForPosting: vi.fn(),
  countActiveReportsForPosting: vi.fn(),
  getReporterUserIdsForPosting: vi.fn(),
}));

vi.mock("@igbo/db/queries/portal-job-postings", () => ({
  getJobPostingWithCompany: vi.fn(),
}));

vi.mock("@igbo/db/queries/portal-admin-flags", () => ({
  getOpenFlagForPosting: vi.fn(),
}));

vi.mock("@igbo/db/queries/notifications", () => ({
  createNotification: vi.fn(),
}));

vi.mock("@igbo/db", () => ({
  db: {
    update: vi.fn(),
    insert: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock("@igbo/db/schema/portal-posting-reports", () => ({
  portalPostingReports: {
    id: "ppr_id",
    postingId: "ppr_posting_id",
    reporterUserId: "ppr_reporter",
    status: "ppr_status",
  },
}));

vi.mock("@igbo/db/schema/portal-job-postings", () => ({
  portalJobPostings: { id: "pjp_id", status: "pjp_status" },
}));

vi.mock("@igbo/db/schema/audit-logs", () => ({
  auditLogs: { id: "al_id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ eq: [col, val] })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  inArray: vi.fn((col: unknown, vals: unknown[]) => ({ inArray: [col, vals] })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: strings, values }),
    { raw: (s: string) => s },
  ),
}));

vi.mock("@/services/event-bus", () => ({
  portalEventBus: { emit: vi.fn() },
}));

import {
  getExistingActiveReportForUser,
  resolveReportsForPosting,
  dismissReportsForPosting,
  getReporterUserIdsForPosting,
} from "@igbo/db/queries/portal-posting-reports";
import { getJobPostingWithCompany } from "@igbo/db/queries/portal-job-postings";
import { getOpenFlagForPosting } from "@igbo/db/queries/portal-admin-flags";
import { createNotification } from "@igbo/db/queries/notifications";
import { db } from "@igbo/db";
import { portalEventBus } from "@/services/event-bus";
import { submitReport, resolveReportsWithAction, dismissReports } from "./posting-report-service";

const ACTIVE_POSTING = {
  id: "posting-1",
  companyId: "company-1",
  title: "Software Engineer",
  status: "active" as const,
  createdAt: new Date("2026-04-10"),
  updatedAt: new Date("2026-04-10"),
};

const PAUSED_POSTING = { ...ACTIVE_POSTING, status: "paused" as const };

const ACTIVE_COMPANY = {
  id: "company-1",
  ownerUserId: "employer-1",
  name: "Tech Corp",
  trustBadge: false,
  onboardingCompletedAt: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const MOCK_REPORT = {
  id: "report-1",
  postingId: "posting-1",
  reporterUserId: "seeker-1",
  category: "scam_fraud" as const,
  description: "This looks like a scam.",
  status: "open" as const,
  resolutionAction: null,
  resolvedAt: null,
  resolvedByUserId: null,
  resolutionNote: null,
  createdAt: new Date("2026-04-10"),
};

function makeInsertChain(returnValue: unknown) {
  const chain: Record<string, unknown> = {};
  chain["insert"] = vi.fn().mockReturnValue(chain);
  chain["values"] = vi.fn().mockReturnValue(chain);
  chain["returning"] = vi.fn().mockResolvedValue(returnValue);
  return chain;
}

function makeSelectChain(returnValue: unknown) {
  const chain: Record<string, unknown> = {};
  chain["select"] = vi.fn().mockReturnValue(chain);
  chain["from"] = vi.fn().mockReturnValue(chain);
  chain["where"] = vi.fn().mockResolvedValue(returnValue);
  chain["then"] = (resolve: (v: unknown) => unknown) => Promise.resolve(returnValue).then(resolve);
  return chain;
}

function makeUpdateChain(returnValue: unknown = [{ id: "posting-1" }]) {
  const chain: Record<string, unknown> = {};
  chain["update"] = vi.fn().mockReturnValue(chain);
  chain["set"] = vi.fn().mockReturnValue(chain);
  chain["where"] = vi.fn().mockReturnValue(chain);
  chain["returning"] = vi.fn().mockResolvedValue(returnValue);
  return chain;
}

function installSubmitTxMock(opts: { reportCount: number; postingStatus: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(db.transaction).mockImplementation(async (cb: any) => {
    const tx: Record<string, unknown> = {};
    // insert(...).values(...).returning() → report row
    const insertChain = makeInsertChain([MOCK_REPORT]);
    tx["insert"] = vi.fn().mockReturnValue(insertChain);
    // select count
    const selectChain = makeSelectChain([{ cnt: opts.reportCount }]);
    tx["select"] = vi.fn().mockReturnValue(selectChain);
    // update for auto-pause
    if (opts.reportCount >= 5 && opts.postingStatus === "active") {
      const updateChain = makeUpdateChain([{ id: "posting-1" }]);
      tx["update"] = vi.fn().mockReturnValue(updateChain);
    } else {
      tx["update"] = vi.fn();
    }
    return cb(tx);
  });
}

function makeDbInsertChain() {
  const chain: Record<string, unknown> = {};
  chain["values"] = vi.fn().mockResolvedValue(undefined);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getJobPostingWithCompany).mockResolvedValue({
    posting: ACTIVE_POSTING as never,
    company: ACTIVE_COMPANY as never,
  });
  vi.mocked(getExistingActiveReportForUser).mockResolvedValue(null);
  vi.mocked(getReporterUserIdsForPosting).mockResolvedValue([]);
  vi.mocked(resolveReportsForPosting).mockResolvedValue(2);
  vi.mocked(dismissReportsForPosting).mockResolvedValue(1);
  vi.mocked(getOpenFlagForPosting).mockResolvedValue(null);
  vi.mocked(createNotification).mockResolvedValue({} as never);
  // Default: db.insert for audit log (outside tx)
  vi.mocked(db.insert).mockReturnValue(makeDbInsertChain() as never);
  // Default: submitReport tx with 1 report
  installSubmitTxMock({ reportCount: 1, postingStatus: "active" });
});

describe("submitReport", () => {
  it("inserts a report via transaction and returns it", async () => {
    const result = await submitReport({
      postingId: "posting-1",
      reporterUserId: "seeker-1",
      category: "scam_fraud",
      description: "This looks like a scam.",
    });
    expect(db.transaction).toHaveBeenCalled();
    expect(result).toEqual(MOCK_REPORT);
  });

  it("throws NOT_FOUND when posting does not exist", async () => {
    vi.mocked(getJobPostingWithCompany).mockResolvedValue(null);
    await expect(
      submitReport({
        postingId: "nonexistent",
        reporterUserId: "seeker-1",
        category: "scam_fraud",
        description: "desc",
      }),
    ).rejects.toThrow();
  });

  it("throws INVALID_STATUS_TRANSITION when posting is not active/paused", async () => {
    vi.mocked(getJobPostingWithCompany).mockResolvedValue({
      posting: { ...ACTIVE_POSTING, status: "draft" } as never,
      company: ACTIVE_COMPANY as never,
    });
    await expect(
      submitReport({
        postingId: "posting-1",
        reporterUserId: "seeker-1",
        category: "scam_fraud",
        description: "desc",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("throws CANNOT_REPORT_OWN_POSTING when reporter is the company owner", async () => {
    await expect(
      submitReport({
        postingId: "posting-1",
        reporterUserId: "employer-1", // same as ACTIVE_COMPANY.ownerUserId
        category: "scam_fraud",
        description: "desc",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("throws ALREADY_REPORTED when user already has an active report", async () => {
    vi.mocked(getExistingActiveReportForUser).mockResolvedValue(MOCK_REPORT);
    await expect(
      submitReport({
        postingId: "posting-1",
        reporterUserId: "seeker-1",
        category: "scam_fraud",
        description: "desc",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("emits posting.reported event", async () => {
    await submitReport({
      postingId: "posting-1",
      reporterUserId: "seeker-1",
      category: "scam_fraud",
      description: "desc",
    });
    expect(portalEventBus.emit).toHaveBeenCalledWith(
      "posting.reported",
      expect.objectContaining({ jobId: "posting-1", reporterUserId: "seeker-1" }),
    );
  });

  it("auto-pauses posting when report count reaches URGENT threshold (5)", async () => {
    installSubmitTxMock({ reportCount: 5, postingStatus: "active" });

    await submitReport({
      postingId: "posting-1",
      reporterUserId: "seeker-1",
      category: "scam_fraud",
      description: "desc",
    });

    expect(vi.mocked(portalEventBus.emit).mock.calls[0]?.[1]).toMatchObject({ autoPaused: true });
  });

  it("does not auto-pause when posting is already paused", async () => {
    vi.mocked(getJobPostingWithCompany).mockResolvedValue({
      posting: PAUSED_POSTING as never,
      company: ACTIVE_COMPANY as never,
    });
    installSubmitTxMock({ reportCount: 5, postingStatus: "paused" });

    await submitReport({
      postingId: "posting-1",
      reporterUserId: "seeker-1",
      category: "scam_fraud",
      description: "desc",
    });

    expect(vi.mocked(portalEventBus.emit).mock.calls[0]?.[1]).toMatchObject({ autoPaused: false });
  });

  it("does not auto-pause when report count is below URGENT threshold", async () => {
    installSubmitTxMock({ reportCount: 3, postingStatus: "active" });

    await submitReport({
      postingId: "posting-1",
      reporterUserId: "seeker-1",
      category: "scam_fraud",
      description: "desc",
    });

    expect(vi.mocked(portalEventBus.emit).mock.calls[0]?.[1]).toMatchObject({
      priorityEscalated: true,
      autoPaused: false,
    });
  });
});

describe("resolveReportsWithAction", () => {
  it("resolves reports and returns count", async () => {
    const result = await resolveReportsWithAction("posting-1", {
      resolvedByUserId: "admin-1",
      resolutionAction: "reject",
      resolutionNote: "This posting was confirmed fraudulent after investigation.",
    });
    expect(resolveReportsForPosting).toHaveBeenCalledWith("posting-1", {
      resolvedByUserId: "admin-1",
      resolutionAction: "reject",
      resolutionNote: "This posting was confirmed fraudulent after investigation.",
    });
    expect(result).toBe(2);
  });

  it("writes audit log when reports resolved", async () => {
    await resolveReportsWithAction("posting-1", {
      resolvedByUserId: "admin-1",
      resolutionAction: "reject",
      resolutionNote: "Confirmed violation after thorough review.",
    });

    expect(db.insert).toHaveBeenCalled();
  });

  it("notifies reporters when reports resolved", async () => {
    vi.mocked(getReporterUserIdsForPosting).mockResolvedValue(["user-1", "user-2"]);

    await resolveReportsWithAction("posting-1", {
      resolvedByUserId: "admin-1",
      resolutionAction: "reject",
      resolutionNote: "Confirmed violation after thorough review.",
    });

    expect(createNotification).toHaveBeenCalledTimes(2);
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }));
  });

  it("skips notifications and audit log when no reports resolved", async () => {
    vi.mocked(resolveReportsForPosting).mockResolvedValue(0);

    await resolveReportsWithAction("posting-1", {
      resolvedByUserId: "admin-1",
      resolutionAction: "reject",
      resolutionNote: "No violations found after thorough review.",
    });

    expect(createNotification).not.toHaveBeenCalled();
    // db.insert not called for audit log when count=0
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe("dismissReports", () => {
  it("dismisses reports and returns count", async () => {
    const result = await dismissReports("posting-1", {
      resolvedByUserId: "admin-1",
      resolutionNote: "Reviewed all reports and found no policy violations in this posting.",
    });
    expect(dismissReportsForPosting).toHaveBeenCalled();
    expect(result).toBe(1);
  });

  it("un-pauses posting on dismiss when no open flag exists", async () => {
    vi.mocked(getJobPostingWithCompany).mockResolvedValue({
      posting: PAUSED_POSTING as never,
      company: ACTIVE_COMPANY as never,
    });
    vi.mocked(getOpenFlagForPosting).mockResolvedValue(null);
    const chain = makeUpdateChain();
    vi.mocked(db.update).mockReturnValue(chain as never);

    await dismissReports("posting-1", {
      resolvedByUserId: "admin-1",
      resolutionNote: "Reviewed all reports and found no violations in this posting.",
    });

    expect(db.update).toHaveBeenCalled();
  });

  it("does not un-pause when open admin flag exists", async () => {
    vi.mocked(getJobPostingWithCompany).mockResolvedValue({
      posting: PAUSED_POSTING as never,
      company: ACTIVE_COMPANY as never,
    });
    vi.mocked(getOpenFlagForPosting).mockResolvedValue({ id: "flag-1" } as never);

    await dismissReports("posting-1", {
      resolvedByUserId: "admin-1",
      resolutionNote: "No report violations but flag investigation ongoing.",
    });

    expect(db.update).not.toHaveBeenCalled();
  });

  it("does not un-pause when posting was not paused", async () => {
    // ACTIVE_POSTING is already active
    await dismissReports("posting-1", {
      resolvedByUserId: "admin-1",
      resolutionNote: "Reviewed all reports and found no violations in this posting.",
    });

    expect(db.update).not.toHaveBeenCalled();
  });

  it("writes audit log on dismiss", async () => {
    await dismissReports("posting-1", {
      resolvedByUserId: "admin-1",
      resolutionNote: "Reviewed all reports and found no violations in this posting.",
    });

    expect(db.insert).toHaveBeenCalled();
  });

  it("notifies reporters on dismiss", async () => {
    vi.mocked(getReporterUserIdsForPosting).mockResolvedValue(["user-3"]);

    await dismissReports("posting-1", {
      resolvedByUserId: "admin-1",
      resolutionNote: "Reviewed all reports and found no violations in this posting.",
    });

    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-3" }));
  });

  it("skips notifications and audit log when no reports dismissed", async () => {
    vi.mocked(dismissReportsForPosting).mockResolvedValue(0);

    await dismissReports("posting-1", {
      resolvedByUserId: "admin-1",
      resolutionNote: "No active reports found for this posting.",
    });

    expect(createNotification).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
});
