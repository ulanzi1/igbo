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
} from "./portal-applications";
import type { PortalApplication } from "../schema/portal-applications";

const APPLICATION: PortalApplication = {
  id: "app-1",
  jobId: "jp-1",
  seekerUserId: "u-1",
  status: "submitted",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

function makeInsertMock(returnValue: PortalApplication) {
  const returning = vi.fn().mockResolvedValue([returnValue]);
  const values = vi.fn().mockReturnValue({ returning });
  vi.mocked(db.insert).mockReturnValue({ values } as unknown as ReturnType<typeof db.insert>);
}

function makeSelectManyMock(returnValues: PortalApplication[]) {
  const orderBy = vi.fn().mockResolvedValue(returnValues);
  const where = vi.fn().mockReturnValue({ orderBy });
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
  it("updates status and returns updated application", async () => {
    const updated = { ...APPLICATION, status: "under_review" as const };
    makeUpdateMock(updated);
    const result = await updateApplicationStatus("app-1", "under_review");
    expect(result?.status).toBe("under_review");
  });

  it("returns null when not found", async () => {
    makeUpdateMock(undefined);
    const result = await updateApplicationStatus("app-999", "shortlisted");
    expect(result).toBeNull();
  });
});
