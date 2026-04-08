// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../index", () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), transaction: vi.fn() },
}));

import { db } from "../index";
import {
  createSeekerProfile,
  getSeekerProfileByUserId,
  getSeekerProfileById,
  updateSeekerProfile,
  updateSeekerVisibility,
  updateSeekerConsent,
  isSeekerEligibleForMatching,
} from "./portal-seeker-profiles";

const mockProfile = {
  id: "seeker-uuid",
  userId: "user-123",
  headline: "Senior Engineer",
  summary: "Building things",
  skills: ["TypeScript", "React"],
  experienceJson: [
    {
      title: "Senior Engineer",
      company: "Acme",
      startDate: "2022-01",
      endDate: "Present",
      description: "Built stuff",
    },
  ],
  educationJson: [
    {
      institution: "MIT",
      degree: "BSc",
      field: "Computer Science",
      graduationYear: 2020,
    },
  ],
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

function makeInsertMock(returnValue: unknown) {
  const returning = vi.fn().mockResolvedValue(returnValue ? [returnValue] : []);
  const values = vi.fn().mockReturnValue({ returning });
  vi.mocked(db.insert).mockReturnValue({ values } as unknown as ReturnType<typeof db.insert>);
}

function makeSelectLimitMock(returnValue: unknown) {
  const limit = vi.fn().mockResolvedValue(returnValue ? [returnValue] : []);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);
}

function makeUpdateMock(returnValue: unknown) {
  const returning = vi.fn().mockResolvedValue(returnValue ? [returnValue] : []);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  vi.mocked(db.update).mockReturnValue({ set } as unknown as ReturnType<typeof db.update>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createSeekerProfile", () => {
  it("creates and returns a seeker profile row", async () => {
    makeInsertMock(mockProfile);
    const result = await createSeekerProfile({
      userId: "user-123",
      headline: "Senior Engineer",
    });
    expect(result.id).toBe("seeker-uuid");
    expect(result.headline).toBe("Senior Engineer");
  });

  it("returns defaults for skills, experienceJson, educationJson", async () => {
    const profileWithDefaults = {
      ...mockProfile,
      skills: [],
      experienceJson: [],
      educationJson: [],
    };
    makeInsertMock(profileWithDefaults);
    const result = await createSeekerProfile({ userId: "user-123", headline: "Dev" });
    expect(result.skills).toEqual([]);
    expect(result.experienceJson).toEqual([]);
    expect(result.educationJson).toEqual([]);
  });

  it("throws when insert returns no rows", async () => {
    makeInsertMock(undefined);
    await expect(createSeekerProfile({ userId: "user-123", headline: "Dev" })).rejects.toThrow(
      "Failed to create seeker profile",
    );
  });
});

describe("getSeekerProfileByUserId", () => {
  it("returns null when no profile exists", async () => {
    makeSelectLimitMock(undefined);
    const result = await getSeekerProfileByUserId("user-missing");
    expect(result).toBeNull();
  });

  it("returns profile when user has a profile", async () => {
    makeSelectLimitMock(mockProfile);
    const result = await getSeekerProfileByUserId("user-123");
    expect(result).not.toBeNull();
    expect(result!.userId).toBe("user-123");
  });
});

describe("getSeekerProfileById", () => {
  it("returns null when profile not found", async () => {
    makeSelectLimitMock(undefined);
    const result = await getSeekerProfileById("non-existent-id");
    expect(result).toBeNull();
  });

  it("returns profile when found by id", async () => {
    makeSelectLimitMock(mockProfile);
    const result = await getSeekerProfileById("seeker-uuid");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("seeker-uuid");
  });
});

describe("updateSeekerProfile", () => {
  it("returns null for non-existent profile id", async () => {
    makeUpdateMock(undefined);
    const result = await updateSeekerProfile("non-existent", { headline: "New" });
    expect(result).toBeNull();
  });

  it("returns updated profile on success", async () => {
    const updated = { ...mockProfile, headline: "Updated Engineer", updatedAt: new Date() };
    makeUpdateMock(updated);
    const result = await updateSeekerProfile("seeker-uuid", { headline: "Updated Engineer" });
    expect(result).not.toBeNull();
    expect(result!.headline).toBe("Updated Engineer");
  });

  it("bumps updatedAt on update", async () => {
    const before = new Date("2024-01-01");
    const after = new Date("2024-06-01");
    const updated = { ...mockProfile, updatedAt: after };
    makeUpdateMock(updated);
    const result = await updateSeekerProfile("seeker-uuid", { headline: "Changed" });
    expect(result!.updatedAt.getTime()).toBeGreaterThan(before.getTime());
  });

  it("is partial — only provided fields change", async () => {
    const updated = { ...mockProfile, headline: "New Headline", summary: "Building things" };
    makeUpdateMock(updated);
    const result = await updateSeekerProfile("seeker-uuid", { headline: "New Headline" });
    expect(result!.headline).toBe("New Headline");
    expect(result!.summary).toBe("Building things"); // unchanged
  });

  it("JSONB experience round-trips correctly", async () => {
    const experience = [
      { title: "Dev", company: "Corp", startDate: "2020-01", endDate: "Present" },
    ];
    const updated = { ...mockProfile, experienceJson: experience };
    makeUpdateMock(updated);
    const result = await updateSeekerProfile("seeker-uuid", { experienceJson: experience });
    expect(result!.experienceJson).toEqual(experience);
  });

  it("JSONB education round-trips correctly", async () => {
    const education = [{ institution: "Uni", degree: "BSc", field: "CS", graduationYear: 2021 }];
    const updated = { ...mockProfile, educationJson: education };
    makeUpdateMock(updated);
    const result = await updateSeekerProfile("seeker-uuid", { educationJson: education });
    expect(result!.educationJson).toEqual(education);
  });

  it("skills text[] round-trips correctly", async () => {
    const skills = ["TypeScript", "React", "Node"];
    const updated = { ...mockProfile, skills };
    makeUpdateMock(updated);
    const result = await updateSeekerProfile("seeker-uuid", { skills });
    expect(result!.skills).toEqual(skills);
  });
});

// ─── P-2.2 additions ──────────────────────────────────────────────────────────

const mockProfileV2 = {
  ...mockProfile,
  visibility: "passive" as const,
  consentMatching: false,
  consentEmployerView: false,
  consentMatchingChangedAt: null,
  consentEmployerViewChangedAt: null,
};

describe("updateSeekerVisibility", () => {
  it("updates visibility and returns updated row", async () => {
    const updated = { ...mockProfileV2, visibility: "active" as const };
    makeUpdateMock(updated);
    const result = await updateSeekerVisibility("user-123", "active");
    expect(result).not.toBeNull();
    expect(result!.visibility).toBe("active");
  });

  it("cycles active → passive → hidden", async () => {
    const hidden = { ...mockProfileV2, visibility: "hidden" as const };
    makeUpdateMock(hidden);
    const result = await updateSeekerVisibility("user-123", "hidden");
    expect(result!.visibility).toBe("hidden");
  });

  it("returns null for missing userId", async () => {
    makeUpdateMock(undefined);
    const result = await updateSeekerVisibility("non-existent", "active");
    expect(result).toBeNull();
  });
});

describe("updateSeekerConsent", () => {
  it("updates consentMatching only and sets consentMatchingChangedAt", async () => {
    const changedAt = new Date();
    const updated = {
      ...mockProfileV2,
      consentMatching: true,
      consentMatchingChangedAt: changedAt,
    };
    vi.mocked(db.transaction).mockImplementation(async (cb: any) => {
      const txStub = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockProfileV2]),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([updated]),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue(undefined),
        }),
      };
      return cb(txStub);
    });
    const result = await updateSeekerConsent("user-123", { consentMatching: true }, []);
    expect(result).not.toBeNull();
    expect(result!.consentMatching).toBe(true);
    expect(result!.consentMatchingChangedAt).toBeDefined();
  });

  it("updates both consents in one call", async () => {
    const updated = {
      ...mockProfileV2,
      consentMatching: true,
      consentEmployerView: true,
      consentMatchingChangedAt: new Date(),
      consentEmployerViewChangedAt: new Date(),
    };
    vi.mocked(db.transaction).mockImplementation(async (cb: any) => {
      const txStub = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockProfileV2]),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([updated]),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue(undefined),
        }),
      };
      return cb(txStub);
    });
    const result = await updateSeekerConsent(
      "user-123",
      { consentMatching: true, consentEmployerView: true },
      [],
    );
    expect(result!.consentMatching).toBe(true);
    expect(result!.consentEmployerView).toBe(true);
  });

  it("inserts audit entry in the same transaction", async () => {
    let insertCalledWith: unknown[] = [];
    vi.mocked(db.transaction).mockImplementation(async (cb: any) => {
      const txStub = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockProfileV2]),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ ...mockProfileV2, consentMatching: true }]),
            }),
          }),
        }),
        insert: vi.fn().mockImplementation(() => ({
          values: vi.fn().mockImplementation((entries: unknown[]) => {
            insertCalledWith = entries;
            return Promise.resolve(undefined);
          }),
        })),
      };
      return cb(txStub);
    });
    const auditEntry = {
      actorId: "user-123",
      targetUserId: "user-123",
      targetType: "portal_seeker_profile",
      action: "portal.seeker.consent.matching.changed",
      details: { from: false, to: true, seekerProfileId: "seeker-uuid" },
    };
    await updateSeekerConsent("user-123", { consentMatching: true }, [auditEntry]);
    expect(insertCalledWith).toEqual([auditEntry]);
  });

  it("returns null when no profile exists", async () => {
    vi.mocked(db.transaction).mockImplementation(async (cb: any) => {
      const txStub = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]), // not found
            }),
          }),
        }),
      };
      return cb(txStub);
    });
    const result = await updateSeekerConsent("non-existent", { consentMatching: true }, []);
    expect(result).toBeNull();
  });
});

describe("isSeekerEligibleForMatching", () => {
  it("returns false when no profile exists", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);
    const result = await isSeekerEligibleForMatching("non-existent");
    expect(result).toBe(false);
  });

  it("returns false when consentMatching is false", async () => {
    const limit = vi.fn().mockResolvedValue([{ consentMatching: false }]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);
    const result = await isSeekerEligibleForMatching("user-123");
    expect(result).toBe(false);
  });

  it("returns true when consentMatching is true", async () => {
    const limit = vi.fn().mockResolvedValue([{ consentMatching: true }]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);
    const result = await isSeekerEligibleForMatching("user-123");
    expect(result).toBe(true);
  });
});
