// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../index", () => ({ db: { select: vi.fn(), insert: vi.fn(), update: vi.fn() } }));

import { db } from "../index";
import {
  createSeekerProfile,
  getSeekerProfileByUserId,
  getSeekerProfileById,
  updateSeekerProfile,
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
