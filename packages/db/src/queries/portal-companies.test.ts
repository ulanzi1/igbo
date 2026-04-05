// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../index", () => ({ db: { insert: vi.fn(), select: vi.fn(), update: vi.fn() } }));

import { db } from "../index";
import {
  createCompanyProfile,
  getCompanyByOwnerId,
  getCompanyById,
  updateCompanyProfile,
  markOnboardingComplete,
} from "./portal-companies";
import type { PortalCompanyProfile } from "../schema/portal-company-profiles";

const PROFILE: PortalCompanyProfile = {
  id: "cp-1",
  ownerUserId: "u-1",
  name: "Acme Corp",
  logoUrl: null,
  description: null,
  industry: "Tech",
  companySize: "50-200",
  cultureInfo: null,
  trustBadge: false,
  onboardingCompletedAt: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

function makeInsertMock(returnValue: PortalCompanyProfile) {
  const returning = vi.fn().mockResolvedValue([returnValue]);
  const values = vi.fn().mockReturnValue({ returning });
  vi.mocked(db.insert).mockReturnValue({ values } as unknown as ReturnType<typeof db.insert>);
}

function makeSelectMock(returnValue: PortalCompanyProfile | undefined) {
  const limit = vi.fn().mockResolvedValue(returnValue ? [returnValue] : []);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);
}

function makeUpdateMock(returnValue: PortalCompanyProfile | undefined) {
  const returning = vi.fn().mockResolvedValue(returnValue ? [returnValue] : []);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  vi.mocked(db.update).mockReturnValue({ set } as unknown as ReturnType<typeof db.update>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createCompanyProfile", () => {
  it("inserts and returns the new profile", async () => {
    makeInsertMock(PROFILE);
    const result = await createCompanyProfile({ ownerUserId: "u-1", name: "Acme Corp" });
    expect(result).toEqual(PROFILE);
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it("throws if insert returns empty", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const values = vi.fn().mockReturnValue({ returning });
    vi.mocked(db.insert).mockReturnValue({ values } as unknown as ReturnType<typeof db.insert>);
    await expect(createCompanyProfile({ ownerUserId: "u-1", name: "X" })).rejects.toThrow(
      "Failed to create company profile",
    );
  });
});

describe("getCompanyByOwnerId", () => {
  it("returns profile when found", async () => {
    makeSelectMock(PROFILE);
    const result = await getCompanyByOwnerId("u-1");
    expect(result).toEqual(PROFILE);
  });

  it("returns null when not found", async () => {
    makeSelectMock(undefined);
    const result = await getCompanyByOwnerId("u-999");
    expect(result).toBeNull();
  });
});

describe("getCompanyById", () => {
  it("returns profile when found", async () => {
    makeSelectMock(PROFILE);
    const result = await getCompanyById("cp-1");
    expect(result).toEqual(PROFILE);
  });

  it("returns null when not found", async () => {
    makeSelectMock(undefined);
    const result = await getCompanyById("cp-999");
    expect(result).toBeNull();
  });
});

describe("updateCompanyProfile", () => {
  it("updates and returns updated profile", async () => {
    const updated = { ...PROFILE, name: "Acme Corp Updated" };
    makeUpdateMock(updated);
    const result = await updateCompanyProfile("cp-1", { name: "Acme Corp Updated" });
    expect(result?.name).toBe("Acme Corp Updated");
  });

  it("returns null when not found", async () => {
    makeUpdateMock(undefined);
    const result = await updateCompanyProfile("cp-999", { name: "X" });
    expect(result).toBeNull();
  });
});

describe("markOnboardingComplete", () => {
  it("sets onboardingCompletedAt and returns updated profile", async () => {
    const updated = { ...PROFILE, onboardingCompletedAt: new Date("2026-04-05") };
    makeUpdateMock(updated);
    const result = await markOnboardingComplete("cp-1");
    expect(result?.onboardingCompletedAt).toBeInstanceOf(Date);
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("is idempotent — returns null when already completed (WHERE onboarding_completed_at IS NULL no-ops)", async () => {
    makeUpdateMock(undefined);
    const result = await markOnboardingComplete("cp-1");
    expect(result).toBeNull();
  });

  it("returns null for non-existent company id", async () => {
    makeUpdateMock(undefined);
    const result = await markOnboardingComplete("cp-nonexistent");
    expect(result).toBeNull();
  });
});
