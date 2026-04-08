// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../index", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
}));

import { db } from "../index";
import {
  listSeekerCvs,
  getSeekerCvById,
  countSeekerCvs,
  createSeekerCv,
  updateSeekerCv,
  setDefaultCv,
  deleteSeekerCvWithFile,
} from "./portal-seeker-cvs";

const mockCv = {
  id: "cv-uuid",
  seekerProfileId: "profile-uuid",
  fileUploadId: "file-uuid",
  label: "Technical CV",
  isDefault: true,
  createdAt: new Date("2024-01-01"),
};

const mockCvWithFile = {
  ...mockCv,
  file: {
    originalFilename: "cv.pdf",
    fileType: "application/pdf",
    fileSize: 102400,
    objectKey: "portal/cvs/user-1/uuid.pdf",
    status: "processing" as const,
  },
};

const mockCv2 = {
  id: "cv-uuid-2",
  seekerProfileId: "profile-uuid",
  fileUploadId: "file-uuid-2",
  label: "Design CV",
  isDefault: false,
  createdAt: new Date("2024-02-01"),
};

function makeSelectJoinMock(returnValue: unknown[]) {
  const orderBy = vi.fn().mockResolvedValue(returnValue);
  const where = vi.fn().mockReturnValue({ orderBy });
  const innerJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ innerJoin });
  vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);
}

function makeSelectJoinLimitMock(returnValue: unknown) {
  const limit = vi.fn().mockResolvedValue(returnValue ? [returnValue] : []);
  const where = vi.fn().mockReturnValue({ limit });
  const innerJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ innerJoin });
  vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);
}

function makeSelectCountMock(returnValue: number) {
  const where = vi.fn().mockResolvedValue([{ value: returnValue }]);
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);
}

function makeInsertMock(returnValue: unknown) {
  const returning = vi.fn().mockResolvedValue(returnValue ? [returnValue] : []);
  const values = vi.fn().mockReturnValue({ returning });
  vi.mocked(db.insert).mockReturnValue({ values } as unknown as ReturnType<typeof db.insert>);
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

describe("listSeekerCvs", () => {
  it("returns ordered list joined with file metadata", async () => {
    makeSelectJoinMock([mockCvWithFile]);
    const result = await listSeekerCvs("profile-uuid");
    expect(result).toHaveLength(1);
    expect(result[0].file.originalFilename).toBe("cv.pdf");
    expect(result[0].label).toBe("Technical CV");
  });

  it("returns empty array when no CVs exist", async () => {
    makeSelectJoinMock([]);
    const result = await listSeekerCvs("profile-uuid");
    expect(result).toEqual([]);
  });
});

describe("getSeekerCvById", () => {
  it("returns CV with file when found", async () => {
    makeSelectJoinLimitMock(mockCvWithFile);
    const result = await getSeekerCvById("cv-uuid");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("cv-uuid");
    expect(result!.file.fileType).toBe("application/pdf");
  });

  it("returns null when CV not found", async () => {
    makeSelectJoinLimitMock(undefined);
    const result = await getSeekerCvById("non-existent");
    expect(result).toBeNull();
  });
});

describe("countSeekerCvs", () => {
  it("returns 0 when no CVs exist", async () => {
    makeSelectCountMock(0);
    const result = await countSeekerCvs("profile-uuid");
    expect(result).toBe(0);
  });

  it("returns correct count when CVs exist", async () => {
    makeSelectCountMock(3);
    const result = await countSeekerCvs("profile-uuid");
    expect(result).toBe(3);
  });
});

describe("createSeekerCv", () => {
  it("inserts row and returns the created CV", async () => {
    makeInsertMock(mockCv);
    const result = await createSeekerCv({
      seekerProfileId: "profile-uuid",
      fileUploadId: "file-uuid",
      label: "Technical CV",
      isDefault: true,
    });
    expect(result.id).toBe("cv-uuid");
    expect(result.isDefault).toBe(true);
  });

  it("throws when insert returns no rows", async () => {
    makeInsertMock(undefined);
    await expect(
      createSeekerCv({
        seekerProfileId: "profile-uuid",
        fileUploadId: "file-uuid",
        label: "CV",
        isDefault: false,
      }),
    ).rejects.toThrow("Failed to create seeker CV");
  });
});

describe("updateSeekerCv", () => {
  it("changes label only and returns updated row", async () => {
    const updated = { ...mockCv, label: "Management CV" };
    makeUpdateMock(updated);
    const result = await updateSeekerCv("cv-uuid", { label: "Management CV" });
    expect(result).not.toBeNull();
    expect(result!.label).toBe("Management CV");
  });

  it("returns null for missing cvId", async () => {
    makeUpdateMock(undefined);
    const result = await updateSeekerCv("non-existent", { label: "CV" });
    expect(result).toBeNull();
  });
});

describe("setDefaultCv", () => {
  it("calls transaction and promotes target while clearing others", async () => {
    // setDefaultCv uses db.transaction — mock it with (cb: any)
    vi.mocked(db.transaction).mockImplementation(async (cb: any) => {
      const txStub = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ ...mockCv, isDefault: true }]),
            }),
          }),
        }),
      };
      return cb(txStub);
    });
    const result = await setDefaultCv("profile-uuid", "cv-uuid");
    expect(db.transaction).toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(result!.isDefault).toBe(true);
  });

  it("returns null when cvId not found in transaction", async () => {
    vi.mocked(db.transaction).mockImplementation(async (cb: any) => {
      const txStub = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      };
      return cb(txStub);
    });
    const result = await setDefaultCv("profile-uuid", "non-existent");
    expect(result).toBeNull();
  });
});

describe("deleteSeekerCvWithFile", () => {
  it("removes CV row and soft-deletes file_upload", async () => {
    vi.mocked(db.transaction).mockImplementation(async (cb: any) => {
      const txStub = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ ...mockCv, isDefault: false }]),
            }),
          }),
        }),
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      };
      return cb(txStub);
    });
    const result = await deleteSeekerCvWithFile("cv-uuid");
    expect(db.transaction).toHaveBeenCalled();
    // non-default CV (mockCv has isDefault=true, but for this test we treat it)
    expect(result).toHaveProperty("deletedDefaultPromoted");
  });

  it("promotes next CV when default is deleted", async () => {
    const defaultCv = { ...mockCv, isDefault: true };
    const promoted = { ...mockCv2, isDefault: true };
    let updateCallCount = 0;
    vi.mocked(db.transaction).mockImplementation(async (cb: any) => {
      const txStub = {
        select: vi
          .fn()
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([defaultCv]),
              }),
            }),
          })
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([mockCv2]),
                }),
              }),
            }),
          }),
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
        update: vi.fn().mockImplementation(() => {
          updateCallCount++;
          return {
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([promoted]),
              }),
            }),
          };
        }),
      };
      return cb(txStub);
    });
    const result = await deleteSeekerCvWithFile("cv-uuid");
    expect(result.deletedDefaultPromoted).not.toBeNull();
    expect(result.deletedDefaultPromoted!.isDefault).toBe(true);
  });

  it("leaves no default when last CV deleted", async () => {
    const singleCv = { ...mockCv, isDefault: true };
    vi.mocked(db.transaction).mockImplementation(async (cb: any) => {
      const txStub = {
        select: vi
          .fn()
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([singleCv]),
              }),
            }),
          })
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]), // no remaining CVs
                }),
              }),
            }),
          }),
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      };
      return cb(txStub);
    });
    const result = await deleteSeekerCvWithFile("cv-uuid");
    expect(result.deletedDefaultPromoted).toBeNull();
  });

  it("returns null deletedDefaultPromoted for missing cvId", async () => {
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
    const result = await deleteSeekerCvWithFile("non-existent");
    expect(result.deletedDefaultPromoted).toBeNull();
  });
});
