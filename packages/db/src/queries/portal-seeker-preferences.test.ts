// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../index", () => ({
  db: { select: vi.fn(), insert: vi.fn() },
}));

import { db } from "../index";
import {
  getSeekerPreferencesByProfileId,
  upsertSeekerPreferences,
} from "./portal-seeker-preferences";

const mockPrefs = {
  id: "pref-uuid",
  seekerProfileId: "profile-uuid",
  desiredRoles: ["Engineer", "Manager"],
  salaryMin: 200000,
  salaryMax: 500000,
  salaryCurrency: "NGN",
  locations: ["Lagos", "Remote"],
  workModes: ["remote", "hybrid"],
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

function makeSelectLimitMock(returnValue: unknown) {
  const limit = vi.fn().mockResolvedValue(returnValue ? [returnValue] : []);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);
}

function makeInsertConflictMock(returnValue: unknown) {
  const returning = vi.fn().mockResolvedValue(returnValue ? [returnValue] : []);
  const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
  vi.mocked(db.insert).mockReturnValue({ values } as unknown as ReturnType<typeof db.insert>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getSeekerPreferencesByProfileId", () => {
  it("returns null when no row exists", async () => {
    makeSelectLimitMock(undefined);
    const result = await getSeekerPreferencesByProfileId("profile-missing");
    expect(result).toBeNull();
  });

  it("returns preferences row when found", async () => {
    makeSelectLimitMock(mockPrefs);
    const result = await getSeekerPreferencesByProfileId("profile-uuid");
    expect(result).not.toBeNull();
    expect(result!.seekerProfileId).toBe("profile-uuid");
  });
});

describe("upsertSeekerPreferences", () => {
  it("inserts on first call and returns the row", async () => {
    makeInsertConflictMock(mockPrefs);
    const result = await upsertSeekerPreferences("profile-uuid", {
      desiredRoles: ["Engineer"],
      salaryCurrency: "NGN",
      locations: [],
      workModes: ["remote"],
    });
    expect(result.seekerProfileId).toBe("profile-uuid");
    expect(db.insert).toHaveBeenCalled();
  });

  it("calls onConflictDoUpdate on second call (update path)", async () => {
    const updated = { ...mockPrefs, desiredRoles: ["Manager"] };
    makeInsertConflictMock(updated);
    const result = await upsertSeekerPreferences("profile-uuid", {
      desiredRoles: ["Manager"],
      salaryCurrency: "NGN",
      locations: [],
      workModes: [],
    });
    expect(result.desiredRoles).toEqual(["Manager"]);
  });

  it("bumps updatedAt on upsert", async () => {
    const original = new Date("2024-01-01");
    const newer = { ...mockPrefs, updatedAt: new Date() };
    makeInsertConflictMock(newer);
    const result = await upsertSeekerPreferences("profile-uuid", {
      desiredRoles: [],
      salaryCurrency: "NGN",
      locations: [],
      workModes: [],
    });
    expect(result.updatedAt.getTime()).toBeGreaterThanOrEqual(original.getTime());
  });

  it("workModes / desiredRoles / locations arrays round-trip correctly", async () => {
    const prefs = {
      ...mockPrefs,
      desiredRoles: ["Software Engineer"],
      locations: ["Abuja"],
      workModes: ["onsite"],
    };
    makeInsertConflictMock(prefs);
    const result = await upsertSeekerPreferences("profile-uuid", {
      desiredRoles: ["Software Engineer"],
      salaryCurrency: "NGN",
      locations: ["Abuja"],
      workModes: ["onsite"],
    });
    expect(result.desiredRoles).toEqual(["Software Engineer"]);
    expect(result.locations).toEqual(["Abuja"]);
    expect(result.workModes).toEqual(["onsite"]);
  });

  it("upsert with null salaryMin/Max persists nulls", async () => {
    const prefs = { ...mockPrefs, salaryMin: null, salaryMax: null };
    makeInsertConflictMock(prefs);
    const result = await upsertSeekerPreferences("profile-uuid", {
      desiredRoles: [],
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: "NGN",
      locations: [],
      workModes: [],
    });
    expect(result.salaryMin).toBeNull();
    expect(result.salaryMax).toBeNull();
  });

  it("throws when insert returns no rows", async () => {
    makeInsertConflictMock(undefined);
    await expect(
      upsertSeekerPreferences("profile-uuid", {
        desiredRoles: [],
        salaryCurrency: "NGN",
        locations: [],
        workModes: [],
      }),
    ).rejects.toThrow("Failed to upsert seeker preferences");
  });
});
