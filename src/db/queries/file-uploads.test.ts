// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

function makeInsertChain(result: unknown) {
  return { values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(result) }) };
}

function makeSelectChainLimitTerminal(result: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
}

function makeSelectChainWhereTerminal(result: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(result),
  };
}

function makeUpdateChain() {
  return { set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) };
}

function makeDeleteChain() {
  return { where: vi.fn().mockResolvedValue(undefined) };
}

vi.mock("@/db", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

vi.mock("@/db/schema/file-uploads", () => ({
  platformFileUploads: {
    id: "id",
    objectKey: "objectKey",
    status: "status",
  },
}));

import {
  createFileUpload,
  getFileUploadByKey,
  getFileUploadById,
  updateFileUpload,
  findProcessingFileUploads,
  findPendingScanFileUploads,
  deleteFileUploadByKey,
} from "./file-uploads";

beforeEach(() => {
  mockInsert.mockReset();
  mockSelect.mockReset();
  mockUpdate.mockReset();
  mockDelete.mockReset();
});

describe("createFileUpload", () => {
  it("inserts and returns a file upload record", async () => {
    const record = { id: "f1", objectKey: "uploads/test.jpg" };
    mockInsert.mockReturnValue(makeInsertChain([record]));

    const result = await createFileUpload({
      uploaderId: "u1",
      objectKey: "uploads/test.jpg",
      originalFilename: "test.jpg",
      fileType: "image/jpeg",
      fileSize: 1024,
    });
    expect(result).toEqual(record);
  });

  it("throws when insert returns no record", async () => {
    mockInsert.mockReturnValue(makeInsertChain([]));

    await expect(createFileUpload({ uploaderId: "u1", objectKey: "k" })).rejects.toThrow(
      "Insert returned no record",
    );
  });
});

describe("getFileUploadByKey", () => {
  it("returns record when found", async () => {
    const record = { id: "f1", objectKey: "uploads/test.jpg" };
    mockSelect.mockReturnValue(makeSelectChainLimitTerminal([record]));

    const result = await getFileUploadByKey("uploads/test.jpg");
    expect(result).toEqual(record);
  });

  it("returns null when not found", async () => {
    mockSelect.mockReturnValue(makeSelectChainLimitTerminal([]));

    const result = await getFileUploadByKey("missing");
    expect(result).toBeNull();
  });
});

describe("getFileUploadById", () => {
  it("returns record when found", async () => {
    const record = { id: "f1" };
    mockSelect.mockReturnValue(makeSelectChainLimitTerminal([record]));

    const result = await getFileUploadById("f1");
    expect(result).toEqual(record);
  });
});

describe("updateFileUpload", () => {
  it("updates the file upload record", async () => {
    const chain = makeUpdateChain();
    mockUpdate.mockReturnValue(chain);

    await updateFileUpload("f1", { status: "ready" });
    expect(chain.set).toHaveBeenCalled();
  });
});

describe("findProcessingFileUploads", () => {
  it("returns uploads with processing status", async () => {
    const rows = [{ id: "f1", status: "processing" }];
    mockSelect.mockReturnValue(makeSelectChainWhereTerminal(rows));

    const result = await findProcessingFileUploads();
    expect(result).toEqual(rows);
  });
});

describe("findPendingScanFileUploads", () => {
  it("returns uploads with pending_scan status", async () => {
    const rows = [{ id: "f1", status: "pending_scan" }];
    mockSelect.mockReturnValue(makeSelectChainWhereTerminal(rows));

    const result = await findPendingScanFileUploads();
    expect(result).toEqual(rows);
  });
});

describe("deleteFileUploadByKey", () => {
  it("deletes upload by objectKey", async () => {
    const chain = makeDeleteChain();
    mockDelete.mockReturnValue(chain);

    await deleteFileUploadByKey("uploads/test.jpg");
    expect(chain.where).toHaveBeenCalled();
  });
});
