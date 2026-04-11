// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../index", () => ({ db: { insert: vi.fn(), select: vi.fn(), update: vi.fn() } }));

import { db } from "../index";
import {
  createApplication,
  getApplicationsByJobId,
  getApplicationsBySeekerId,
  updateApplicationStatus,
  insertTransition,
  getTransitionHistory,
  getApplicationWithCurrentStatus,
  insertApplicationWithPayload,
  getExistingActiveApplication,
  getApplicationCountsByStatusForSeeker,
} from "./portal-applications";
import type { PortalApplication, PortalApplicationTransition } from "../schema/portal-applications";

const APPLICATION: PortalApplication = {
  id: "app-1",
  jobId: "jp-1",
  seekerUserId: "u-1",
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

const TRANSITION: PortalApplicationTransition = {
  id: "tr-1",
  applicationId: "app-1",
  fromStatus: "submitted",
  toStatus: "under_review",
  actorUserId: "employer-1",
  actorRole: "employer",
  reason: null,
  createdAt: new Date("2026-01-02"),
};

function makeInsertMock(returnValue: unknown) {
  const returning = vi.fn().mockResolvedValue([returnValue]);
  const values = vi.fn().mockReturnValue({ returning });
  vi.mocked(db.insert).mockReturnValue({ values } as unknown as ReturnType<typeof db.insert>);
}

function makeSelectManyMock(returnValues: unknown[]) {
  const orderBy = vi.fn().mockResolvedValue(returnValues);
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);
}

function makeSelectWithJoinMock(returnValues: unknown[]) {
  const where = vi.fn().mockResolvedValue(returnValues);
  const leftJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ leftJoin });
  vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);
}

function makeSelectWithLimitMock(returnValues: unknown[]) {
  const limit = vi.fn().mockResolvedValue(returnValues);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);
}

function makeUpdateMock(returnValue: PortalApplication | undefined) {
  const returning = vi.fn().mockResolvedValue(returnValue ? [returnValue] : []);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  vi.mocked(db.update).mockReturnValue({ set } as unknown as ReturnType<typeof db.update>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createApplication", () => {
  it("inserts and returns the new application", async () => {
    makeInsertMock(APPLICATION);
    const result = await createApplication({ jobId: "jp-1", seekerUserId: "u-1" });
    expect(result).toEqual(APPLICATION);
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it("throws if insert returns empty", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const values = vi.fn().mockReturnValue({ returning });
    vi.mocked(db.insert).mockReturnValue({ values } as unknown as ReturnType<typeof db.insert>);
    await expect(createApplication({ jobId: "jp-1", seekerUserId: "u-1" })).rejects.toThrow(
      "Failed to create application",
    );
  });
});

describe("getApplicationsByJobId", () => {
  it("returns array of applications for job", async () => {
    makeSelectManyMock([APPLICATION]);
    const result = await getApplicationsByJobId("jp-1");
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("app-1");
  });

  it("returns empty array when none found", async () => {
    makeSelectManyMock([]);
    const result = await getApplicationsByJobId("jp-999");
    expect(result).toHaveLength(0);
  });
});

describe("getApplicationsBySeekerId", () => {
  it("returns applications for seeker", async () => {
    makeSelectManyMock([APPLICATION]);
    const result = await getApplicationsBySeekerId("u-1");
    expect(result).toHaveLength(1);
    expect(result[0]?.seekerUserId).toBe("u-1");
  });

  it("returns empty array when seeker has no applications", async () => {
    makeSelectManyMock([]);
    const result = await getApplicationsBySeekerId("u-999");
    expect(result).toHaveLength(0);
  });
});

describe("updateApplicationStatus", () => {
  it("updates status with audit fields and returns updated application", async () => {
    const updated: PortalApplication = {
      ...APPLICATION,
      status: "under_review",
      previousStatus: "submitted",
      transitionedAt: new Date("2026-01-02"),
      transitionedByUserId: "employer-1",
    };
    makeUpdateMock(updated);
    const result = await updateApplicationStatus(
      "app-1",
      "under_review",
      "submitted",
      "employer-1",
    );
    expect(result?.status).toBe("under_review");
    expect(result?.previousStatus).toBe("submitted");
    expect(result?.transitionedByUserId).toBe("employer-1");
  });

  it("updates status with minimal args (no previousStatus or actor)", async () => {
    const updated: PortalApplication = {
      ...APPLICATION,
      status: "shortlisted",
    };
    makeUpdateMock(updated);
    const result = await updateApplicationStatus("app-1", "shortlisted");
    expect(result?.status).toBe("shortlisted");
  });

  it("returns null when not found", async () => {
    makeUpdateMock(undefined);
    const result = await updateApplicationStatus("app-999", "shortlisted");
    expect(result).toBeNull();
  });
});

describe("insertTransition", () => {
  it("inserts and returns the transition row", async () => {
    makeInsertMock(TRANSITION);
    const result = await insertTransition({
      applicationId: "app-1",
      fromStatus: "submitted",
      toStatus: "under_review",
      actorUserId: "employer-1",
      actorRole: "employer",
    });
    expect(result).toEqual(TRANSITION);
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it("throws if insert returns empty", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const values = vi.fn().mockReturnValue({ returning });
    vi.mocked(db.insert).mockReturnValue({ values } as unknown as ReturnType<typeof db.insert>);
    await expect(
      insertTransition({
        applicationId: "app-1",
        fromStatus: "submitted",
        toStatus: "under_review",
        actorUserId: "employer-1",
        actorRole: "employer",
      }),
    ).rejects.toThrow("Failed to insert transition");
  });

  it("inserts transition with optional reason", async () => {
    const withReason = { ...TRANSITION, reason: "Looks great" };
    makeInsertMock(withReason);
    const result = await insertTransition({
      applicationId: "app-1",
      fromStatus: "under_review",
      toStatus: "shortlisted",
      actorUserId: "employer-1",
      actorRole: "employer",
      reason: "Looks great",
    });
    expect(result.reason).toBe("Looks great");
  });

  it("inserts seeker withdrawal transition", async () => {
    const withdrawal: PortalApplicationTransition = {
      ...TRANSITION,
      id: "tr-2",
      fromStatus: "under_review",
      toStatus: "withdrawn",
      actorUserId: "seeker-1",
      actorRole: "job_seeker",
    };
    makeInsertMock(withdrawal);
    const result = await insertTransition({
      applicationId: "app-1",
      fromStatus: "under_review",
      toStatus: "withdrawn",
      actorUserId: "seeker-1",
      actorRole: "job_seeker",
    });
    expect(result.actorRole).toBe("job_seeker");
    expect(result.toStatus).toBe("withdrawn");
  });
});

describe("getTransitionHistory", () => {
  it("returns chronological transition history", async () => {
    const t2: PortalApplicationTransition = {
      id: "tr-2",
      applicationId: "app-1",
      fromStatus: "under_review",
      toStatus: "shortlisted",
      actorUserId: "employer-1",
      actorRole: "employer",
      reason: null,
      createdAt: new Date("2026-01-03"),
    };
    makeSelectManyMock([TRANSITION, t2]);
    const result = await getTransitionHistory("app-1");
    expect(result).toHaveLength(2);
    expect(result[0]?.fromStatus).toBe("submitted");
    expect(result[0]?.toStatus).toBe("under_review");
    expect(result[1]?.fromStatus).toBe("under_review");
    expect(result[1]?.toStatus).toBe("shortlisted");
  });

  it("returns empty array when no transitions exist", async () => {
    makeSelectManyMock([]);
    const result = await getTransitionHistory("app-999");
    expect(result).toHaveLength(0);
  });
});

describe("getApplicationWithCurrentStatus", () => {
  it("returns application with companyId from joined job posting", async () => {
    const row = {
      id: "app-1",
      status: "submitted" as const,
      jobId: "jp-1",
      seekerUserId: "u-1",
      companyId: "cp-1",
    };
    makeSelectWithJoinMock([row]);
    const result = await getApplicationWithCurrentStatus("app-1");
    expect(result).not.toBeNull();
    expect(result?.id).toBe("app-1");
    expect(result?.status).toBe("submitted");
    expect(result?.jobId).toBe("jp-1");
    expect(result?.seekerUserId).toBe("u-1");
    expect(result?.companyId).toBe("cp-1");
  });

  it("returns null when application not found", async () => {
    makeSelectWithJoinMock([]);
    const result = await getApplicationWithCurrentStatus("app-999");
    expect(result).toBeNull();
  });

  it("returns null when companyId is null (job posting missing)", async () => {
    const row = {
      id: "app-1",
      status: "submitted" as const,
      jobId: "jp-orphan",
      seekerUserId: "u-1",
      companyId: null,
    };
    makeSelectWithJoinMock([row]);
    const result = await getApplicationWithCurrentStatus("app-1");
    expect(result).toBeNull();
  });
});

describe("insertApplicationWithPayload", () => {
  it("inserts application with full payload and returns it", async () => {
    const expected: PortalApplication = {
      ...APPLICATION,
      selectedCvId: "cv-1",
      coverLetterText: "I am very interested in this role.",
      portfolioLinksJson: ["https://example.com/portfolio"],
    };
    makeInsertMock(expected);
    const result = await insertApplicationWithPayload({
      jobId: "jp-1",
      seekerUserId: "u-1",
      selectedCvId: "cv-1",
      coverLetterText: "I am very interested in this role.",
      portfolioLinks: ["https://example.com/portfolio"],
    });
    expect(result).toEqual(expected);
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it("inserts application with null cv and cover letter", async () => {
    makeInsertMock(APPLICATION);
    const result = await insertApplicationWithPayload({
      jobId: "jp-1",
      seekerUserId: "u-1",
      selectedCvId: null,
      coverLetterText: null,
      portfolioLinks: [],
    });
    expect(result).toEqual(APPLICATION);
  });

  it("throws if insert returns empty", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const values = vi.fn().mockReturnValue({ returning });
    vi.mocked(db.insert).mockReturnValue({ values } as unknown as ReturnType<typeof db.insert>);
    await expect(
      insertApplicationWithPayload({
        jobId: "jp-1",
        seekerUserId: "u-1",
        selectedCvId: null,
        coverLetterText: null,
        portfolioLinks: [],
      }),
    ).rejects.toThrow("Failed to insert application");
  });
});

describe("getExistingActiveApplication", () => {
  it("returns non-withdrawn application for job+seeker pair", async () => {
    makeSelectWithLimitMock([APPLICATION]);
    const result = await getExistingActiveApplication("jp-1", "u-1");
    expect(result).toEqual(APPLICATION);
    expect(result?.id).toBe("app-1");
  });

  it("returns null when no active application exists", async () => {
    makeSelectWithLimitMock([]);
    const result = await getExistingActiveApplication("jp-999", "u-1");
    expect(result).toBeNull();
  });

  it("returns null when only withdrawn application exists (filtered by ne constraint)", async () => {
    // The query uses ne(status, 'withdrawn') so withdrawn rows are never returned
    makeSelectWithLimitMock([]);
    const result = await getExistingActiveApplication("jp-1", "u-withdrawn");
    expect(result).toBeNull();
  });
});

describe("getApplicationsWithJobDataBySeekerId", () => {
  function makeDoubleJoinOrderByMock(returnValues: unknown[]) {
    const orderBy = vi.fn().mockResolvedValue(returnValues);
    const where = vi.fn().mockReturnValue({ orderBy });
    const leftJoin2 = vi.fn().mockReturnValue({ where });
    const leftJoin1 = vi.fn().mockReturnValue({ leftJoin: leftJoin2 });
    const from = vi.fn().mockReturnValue({ leftJoin: leftJoin1 });
    vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);
  }

  it("returns enriched list with job title and company name", async () => {
    const row = {
      id: "app-1",
      jobId: "jp-1",
      status: "submitted" as const,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-02"),
      transitionedAt: null,
      jobTitle: "Senior Engineer",
      companyId: "cp-1",
      companyName: "Acme Corp",
    };
    makeDoubleJoinOrderByMock([row]);
    const { getApplicationsWithJobDataBySeekerId } = await import("./portal-applications");
    const result = await getApplicationsWithJobDataBySeekerId("u-1");
    expect(result).toHaveLength(1);
    expect(result[0]?.jobTitle).toBe("Senior Engineer");
    expect(result[0]?.companyName).toBe("Acme Corp");
    expect(result[0]?.status).toBe("submitted");
  });

  it("returns empty array when seeker has no applications", async () => {
    makeDoubleJoinOrderByMock([]);
    const { getApplicationsWithJobDataBySeekerId } = await import("./portal-applications");
    const result = await getApplicationsWithJobDataBySeekerId("u-999");
    expect(result).toHaveLength(0);
  });

  it("calls db.select once per invocation", async () => {
    makeDoubleJoinOrderByMock([]);
    const { getApplicationsWithJobDataBySeekerId } = await import("./portal-applications");
    await getApplicationsWithJobDataBySeekerId("u-1");
    expect(db.select).toHaveBeenCalledTimes(1);
  });
});

describe("getApplicationDetailForSeeker", () => {
  function makeTripleJoinWhereMock(returnValues: unknown[]) {
    const where = vi.fn().mockResolvedValue(returnValues);
    const leftJoin3 = vi.fn().mockReturnValue({ where });
    const leftJoin2 = vi.fn().mockReturnValue({ leftJoin: leftJoin3 });
    const leftJoin1 = vi.fn().mockReturnValue({ leftJoin: leftJoin2 });
    const from = vi.fn().mockReturnValue({ leftJoin: leftJoin1 });
    vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);
  }

  it("returns full application detail with CV label", async () => {
    const row = {
      id: "app-1",
      jobId: "jp-1",
      seekerUserId: "u-1",
      status: "submitted" as const,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-02"),
      coverLetterText: "I am a great fit.",
      portfolioLinksJson: ["https://example.com"],
      selectedCvId: "cv-1",
      jobTitle: "Senior Engineer",
      companyId: "cp-1",
      companyName: "Acme Corp",
      cvLabel: "Main CV",
    };
    makeTripleJoinWhereMock([row]);
    const { getApplicationDetailForSeeker } = await import("./portal-applications");
    const result = await getApplicationDetailForSeeker("app-1", "u-1");
    expect(result).not.toBeNull();
    expect(result?.id).toBe("app-1");
    expect(result?.jobTitle).toBe("Senior Engineer");
    expect(result?.companyName).toBe("Acme Corp");
    expect(result?.cvLabel).toBe("Main CV");
    expect(result?.coverLetterText).toBe("I am a great fit.");
  });

  it("returns null when application not found", async () => {
    makeTripleJoinWhereMock([]);
    const { getApplicationDetailForSeeker } = await import("./portal-applications");
    const result = await getApplicationDetailForSeeker("app-999", "u-1");
    expect(result).toBeNull();
  });

  it("returns application with null cvLabel when no CV selected", async () => {
    const row = {
      id: "app-1",
      jobId: "jp-1",
      seekerUserId: "u-1",
      status: "submitted" as const,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-02"),
      coverLetterText: null,
      portfolioLinksJson: [],
      selectedCvId: null,
      jobTitle: "Senior Engineer",
      companyId: "cp-1",
      companyName: "Acme Corp",
      cvLabel: null,
    };
    makeTripleJoinWhereMock([row]);
    const { getApplicationDetailForSeeker } = await import("./portal-applications");
    const result = await getApplicationDetailForSeeker("app-1", "u-1");
    expect(result?.cvLabel).toBeNull();
    expect(result?.coverLetterText).toBeNull();
  });

  it("returns null for non-owned application (seekerUserId mismatch scoped at DB query level)", async () => {
    // The query includes `eq(portalApplications.seekerUserId, seekerUserId)` in WHERE
    // so non-owned applications return empty rows
    makeTripleJoinWhereMock([]);
    const { getApplicationDetailForSeeker } = await import("./portal-applications");
    const result = await getApplicationDetailForSeeker("app-1", "u-other");
    expect(result).toBeNull();
  });
});

// ─── P-2.8 additions ──────────────────────────────────────────────────────────

describe("getApplicationCountsByStatusForSeeker", () => {
  function makeGroupByMock(returnValues: unknown[]) {
    const groupBy = vi.fn().mockResolvedValue(returnValues);
    const where = vi.fn().mockReturnValue({ groupBy });
    const from = vi.fn().mockReturnValue({ where });
    vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);
  }

  it("returns counts grouped by status for mixed statuses", async () => {
    makeGroupByMock([
      { status: "submitted", count: 2 },
      { status: "interview", count: 1 },
      { status: "rejected", count: 3 },
    ]);
    const result = await getApplicationCountsByStatusForSeeker("u-1");
    expect(result).toHaveLength(3);
    expect(result).toContainEqual({ status: "submitted", count: 2 });
    expect(result).toContainEqual({ status: "interview", count: 1 });
    expect(result).toContainEqual({ status: "rejected", count: 3 });
  });

  it("returns empty array when seeker has no applications", async () => {
    makeGroupByMock([]);
    const result = await getApplicationCountsByStatusForSeeker("u-999");
    expect(result).toHaveLength(0);
  });

  it("returns single status when all apps have same status", async () => {
    makeGroupByMock([{ status: "submitted", count: 5 }]);
    const result = await getApplicationCountsByStatusForSeeker("u-1");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ status: "submitted", count: 5 });
  });
});

// ─── P-2.9 additions ──────────────────────────────────────────────────────────

describe("getApplicationsWithSeekerDataByJobId", () => {
  function makeDoubleJoinOrderByMock(returnValues: unknown[]) {
    const orderBy = vi.fn().mockResolvedValue(returnValues);
    const where = vi.fn().mockReturnValue({ orderBy });
    const leftJoin2 = vi.fn().mockReturnValue({ where });
    const leftJoin1 = vi.fn().mockReturnValue({ leftJoin: leftJoin2 });
    const from = vi.fn().mockReturnValue({ leftJoin: leftJoin1 });
    vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);
  }

  it("returns enriched rows with seeker name, headline, profileId and skills", async () => {
    const row = {
      id: "app-1",
      jobId: "jp-1",
      seekerUserId: "u-1",
      status: "submitted" as const,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
      coverLetterText: null,
      portfolioLinksJson: [],
      selectedCvId: null,
      seekerName: "Ada Okafor",
      seekerHeadline: "Senior Engineer",
      seekerProfileId: "sp-1",
      seekerSkills: ["typescript", "react"],
    };
    makeDoubleJoinOrderByMock([row]);
    const { getApplicationsWithSeekerDataByJobId } = await import("./portal-applications");
    const result = await getApplicationsWithSeekerDataByJobId("jp-1");
    expect(result).toHaveLength(1);
    expect(result[0]?.seekerName).toBe("Ada Okafor");
    expect(result[0]?.seekerHeadline).toBe("Senior Engineer");
    expect(result[0]?.seekerProfileId).toBe("sp-1");
    expect(result[0]?.seekerSkills).toEqual(["typescript", "react"]);
  });

  it("returns empty array when no applications exist", async () => {
    makeDoubleJoinOrderByMock([]);
    const { getApplicationsWithSeekerDataByJobId } = await import("./portal-applications");
    const result = await getApplicationsWithSeekerDataByJobId("jp-999");
    expect(result).toHaveLength(0);
  });

  it("coerces null skills/portfolioLinksJson to empty arrays", async () => {
    const row = {
      id: "app-1",
      jobId: "jp-1",
      seekerUserId: "u-1",
      status: "submitted" as const,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
      coverLetterText: null,
      portfolioLinksJson: null,
      selectedCvId: null,
      seekerName: null,
      seekerHeadline: null,
      seekerProfileId: null,
      seekerSkills: null,
    };
    makeDoubleJoinOrderByMock([row]);
    const { getApplicationsWithSeekerDataByJobId } = await import("./portal-applications");
    const result = await getApplicationsWithSeekerDataByJobId("jp-1");
    expect(result[0]?.seekerSkills).toEqual([]);
    expect(result[0]?.portfolioLinksJson).toEqual([]);
  });

  it("returns mixed statuses for a busy posting", async () => {
    const rows = [
      {
        id: "app-1",
        jobId: "jp-1",
        seekerUserId: "u-1",
        status: "submitted" as const,
        createdAt: new Date("2026-01-03"),
        updatedAt: new Date("2026-01-03"),
        coverLetterText: null,
        portfolioLinksJson: [],
        selectedCvId: null,
        seekerName: "A",
        seekerHeadline: "H1",
        seekerProfileId: "sp-1",
        seekerSkills: [],
      },
      {
        id: "app-2",
        jobId: "jp-1",
        seekerUserId: "u-2",
        status: "under_review" as const,
        createdAt: new Date("2026-01-02"),
        updatedAt: new Date("2026-01-02"),
        coverLetterText: null,
        portfolioLinksJson: [],
        selectedCvId: null,
        seekerName: "B",
        seekerHeadline: "H2",
        seekerProfileId: "sp-2",
        seekerSkills: [],
      },
    ];
    makeDoubleJoinOrderByMock(rows);
    const { getApplicationsWithSeekerDataByJobId } = await import("./portal-applications");
    const result = await getApplicationsWithSeekerDataByJobId("jp-1");
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.status)).toEqual(["submitted", "under_review"]);
  });
});

describe("getApplicationDetailForEmployer", () => {
  function makeQuadrupleJoinWhereMock(returnValues: unknown[]) {
    const where = vi.fn().mockResolvedValue(returnValues);
    const leftJoin5 = vi.fn().mockReturnValue({ where });
    const leftJoin4 = vi.fn().mockReturnValue({ leftJoin: leftJoin5 });
    const leftJoin3 = vi.fn().mockReturnValue({ leftJoin: leftJoin4 });
    const leftJoin2 = vi.fn().mockReturnValue({ leftJoin: leftJoin3 });
    const leftJoin1 = vi.fn().mockReturnValue({ leftJoin: leftJoin2 });
    const from = vi.fn().mockReturnValue({ leftJoin: leftJoin1 });
    vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);
  }

  it("returns full detail row for valid employer ownership", async () => {
    const row = {
      id: "app-1",
      jobId: "jp-1",
      seekerUserId: "u-1",
      status: "under_review" as const,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-02"),
      coverLetterText: "I am excited to apply",
      portfolioLinksJson: ["https://example.com"],
      selectedCvId: "cv-1",
      jobTitle: "Senior Engineer",
      companyId: "cp-1",
      seekerName: "Ada Okafor",
      seekerHeadline: "Full Stack Engineer",
      seekerProfileId: "sp-1",
      seekerSummary: "5+ years of experience",
      seekerSkills: ["typescript", "react"],
      cvId: "cv-1",
      cvLabel: "Primary CV",
      cvProcessedUrl: "https://storage.example.com/cvs/file.pdf",
    };
    makeQuadrupleJoinWhereMock([row]);
    const { getApplicationDetailForEmployer } = await import("./portal-applications");
    const result = await getApplicationDetailForEmployer("app-1", "cp-1");
    expect(result).not.toBeNull();
    expect(result?.id).toBe("app-1");
    expect(result?.seekerName).toBe("Ada Okafor");
    expect(result?.seekerSkills).toEqual(["typescript", "react"]);
    expect(result?.cvProcessedUrl).toBe("https://storage.example.com/cvs/file.pdf");
    expect(result?.cvLabel).toBe("Primary CV");
  });

  it("returns null when company does not own the job (DB WHERE filters)", async () => {
    // WHERE clause includes eq(portalJobPostings.companyId, companyId)
    // so wrong-company lookups return empty rows
    makeQuadrupleJoinWhereMock([]);
    const { getApplicationDetailForEmployer } = await import("./portal-applications");
    const result = await getApplicationDetailForEmployer("app-1", "cp-other");
    expect(result).toBeNull();
  });

  it("returns null when application does not exist", async () => {
    makeQuadrupleJoinWhereMock([]);
    const { getApplicationDetailForEmployer } = await import("./portal-applications");
    const result = await getApplicationDetailForEmployer("app-missing", "cp-1");
    expect(result).toBeNull();
  });

  it("coerces null portfolioLinksJson/seekerSkills to empty arrays", async () => {
    const row = {
      id: "app-1",
      jobId: "jp-1",
      seekerUserId: "u-1",
      status: "submitted" as const,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
      coverLetterText: null,
      portfolioLinksJson: null,
      selectedCvId: null,
      jobTitle: "Engineer",
      companyId: "cp-1",
      seekerName: "Ada",
      seekerHeadline: "Engineer",
      seekerProfileId: "sp-1",
      seekerSummary: null,
      seekerSkills: null,
      cvId: null,
      cvLabel: null,
      cvProcessedUrl: null,
    };
    makeQuadrupleJoinWhereMock([row]);
    const { getApplicationDetailForEmployer } = await import("./portal-applications");
    const result = await getApplicationDetailForEmployer("app-1", "cp-1");
    expect(result?.seekerSkills).toEqual([]);
    expect(result?.portfolioLinksJson).toEqual([]);
    expect(result?.cvProcessedUrl).toBeNull();
  });
});
