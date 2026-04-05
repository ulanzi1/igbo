// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../index", () => ({ db: { insert: vi.fn(), select: vi.fn(), update: vi.fn() } }));

import { db } from "../index";
import {
  createJobPosting,
  getJobPostingById,
  getJobPostingsByCompanyId,
  getJobPostingsByCompanyIdWithFilter,
  getJobPostingWithCompany,
  countActivePostingsByCompanyId,
  updateJobPosting,
  updateJobPostingStatus,
} from "./portal-job-postings";
import type { PortalJobPosting } from "../schema/portal-job-postings";

const POSTING: PortalJobPosting = {
  id: "jp-1",
  companyId: "cp-1",
  title: "Software Engineer",
  descriptionHtml: "<p>Job desc</p>",
  requirements: null,
  salaryMin: 80000,
  salaryMax: 120000,
  salaryCompetitiveOnly: false,
  location: "Lagos",
  employmentType: "full_time",
  status: "draft",
  culturalContextJson: null,
  descriptionIgboHtml: null,
  applicationDeadline: null,
  expiresAt: null,
  adminFeedbackComment: null,
  closedOutcome: null,
  closedAt: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

function makeInsertMock(returnValue: PortalJobPosting) {
  const returning = vi.fn().mockResolvedValue([returnValue]);
  const values = vi.fn().mockReturnValue({ returning });
  vi.mocked(db.insert).mockReturnValue({ values } as unknown as ReturnType<typeof db.insert>);
}

function makeSelectOneMock(returnValue: PortalJobPosting | undefined) {
  const limit = vi.fn().mockResolvedValue(returnValue ? [returnValue] : []);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);
}

function makeSelectManyMock(returnValues: PortalJobPosting[]) {
  const orderBy = vi.fn().mockResolvedValue(returnValues);
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);
}

function makeUpdateMock(returnValue: PortalJobPosting | undefined) {
  const returning = vi.fn().mockResolvedValue(returnValue ? [returnValue] : []);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  vi.mocked(db.update).mockReturnValue({ set } as unknown as ReturnType<typeof db.update>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createJobPosting", () => {
  it("inserts and returns the new posting", async () => {
    makeInsertMock(POSTING);
    const result = await createJobPosting({
      companyId: "cp-1",
      title: "Software Engineer",
      employmentType: "full_time",
    });
    expect(result).toEqual(POSTING);
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it("throws if insert returns empty", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const values = vi.fn().mockReturnValue({ returning });
    vi.mocked(db.insert).mockReturnValue({ values } as unknown as ReturnType<typeof db.insert>);
    await expect(
      createJobPosting({ companyId: "cp-1", title: "X", employmentType: "contract" }),
    ).rejects.toThrow("Failed to create job posting");
  });
});

describe("getJobPostingById", () => {
  it("returns posting when found", async () => {
    makeSelectOneMock(POSTING);
    const result = await getJobPostingById("jp-1");
    expect(result).toEqual(POSTING);
  });

  it("returns null when not found", async () => {
    makeSelectOneMock(undefined);
    const result = await getJobPostingById("jp-999");
    expect(result).toBeNull();
  });
});

describe("getJobPostingsByCompanyId", () => {
  it("returns array of postings", async () => {
    makeSelectManyMock([POSTING]);
    const result = await getJobPostingsByCompanyId("cp-1");
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("jp-1");
  });

  it("returns empty array when none found", async () => {
    makeSelectManyMock([]);
    const result = await getJobPostingsByCompanyId("cp-999");
    expect(result).toHaveLength(0);
  });
});

describe("updateJobPosting", () => {
  it("updates and returns updated posting", async () => {
    const updated = { ...POSTING, title: "Updated Engineer" };
    makeUpdateMock(updated);
    const result = await updateJobPosting("jp-1", { title: "Updated Engineer" });
    expect(result?.title).toBe("Updated Engineer");
  });

  it("returns null when not found", async () => {
    makeUpdateMock(undefined);
    const result = await updateJobPosting("jp-999", { title: "X" });
    expect(result).toBeNull();
  });
});

describe("updateJobPostingStatus", () => {
  it("updates status and returns updated posting", async () => {
    const updated = { ...POSTING, status: "active" as const };
    makeUpdateMock(updated);
    const result = await updateJobPostingStatus("jp-1", "active");
    expect(result?.status).toBe("active");
  });

  it("returns null when not found", async () => {
    makeUpdateMock(undefined);
    const result = await updateJobPostingStatus("jp-999", "active");
    expect(result).toBeNull();
  });
});

describe("getJobPostingsByCompanyIdWithFilter", () => {
  it("returns all postings when no statusFilter provided", async () => {
    makeSelectManyMock([POSTING]);
    const result = await getJobPostingsByCompanyIdWithFilter("cp-1");
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("jp-1");
  });

  it("returns empty array when no postings match", async () => {
    makeSelectManyMock([]);
    const result = await getJobPostingsByCompanyIdWithFilter("cp-1", "active");
    expect(result).toHaveLength(0);
  });

  it("calls db.select when statusFilter is provided", async () => {
    makeSelectManyMock([{ ...POSTING, status: "active" as const }]);
    const result = await getJobPostingsByCompanyIdWithFilter("cp-1", "active");
    expect(result[0]?.status).toBe("active");
    expect(db.select).toHaveBeenCalledTimes(1);
  });
});

describe("countActivePostingsByCompanyId", () => {
  it("returns count of active postings", async () => {
    const where = vi.fn().mockResolvedValue([{ count: 3 }]);
    const from = vi.fn().mockReturnValue({ where });
    vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);

    const result = await countActivePostingsByCompanyId("cp-1");
    expect(result).toBe(3);
  });

  it("returns 0 when no active postings", async () => {
    const where = vi.fn().mockResolvedValue([{ count: 0 }]);
    const from = vi.fn().mockReturnValue({ where });
    vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);

    const result = await countActivePostingsByCompanyId("cp-1");
    expect(result).toBe(0);
  });
});

describe("getJobPostingWithCompany", () => {
  it("returns posting with company when found", async () => {
    const mockCompany = {
      id: "cp-1",
      ownerUserId: "user-1",
      name: "Acme Corp",
      logoUrl: null,
      description: null,
      industry: null,
      companySize: null,
      cultureInfo: null,
      trustBadge: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const limit = vi.fn().mockResolvedValue([{ posting: POSTING, company: mockCompany }]);
    const where = vi.fn().mockReturnValue({ limit });
    const innerJoin = vi.fn().mockReturnValue({ where });
    const from = vi.fn().mockReturnValue({ innerJoin });
    vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);

    const result = await getJobPostingWithCompany("jp-1");
    expect(result).not.toBeNull();
    expect(result?.posting.id).toBe("jp-1");
    expect(result?.company.name).toBe("Acme Corp");
  });

  it("returns null when posting not found", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ limit });
    const innerJoin = vi.fn().mockReturnValue({ where });
    const from = vi.fn().mockReturnValue({ innerJoin });
    vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);

    const result = await getJobPostingWithCompany("jp-999");
    expect(result).toBeNull();
  });
});
