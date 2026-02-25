// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

// vi.hoisted() — mock factory runs before let declarations, causing TDZ without hoisting
const { mockRegisterJob, handlerRef } = vi.hoisted(() => ({
  mockRegisterJob: vi.fn(),
  handlerRef: { current: null as (() => Promise<void>) | null },
}));

vi.mock("@/server/jobs/job-runner", () => ({
  registerJob: (name: string, handler: () => Promise<void>) => {
    mockRegisterJob(name, handler);
    handlerRef.current = handler;
  },
  runJob: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: {
    HETZNER_S3_PUBLIC_URL: "https://cdn.example.com",
    HETZNER_S3_ENDPOINT: "https://nbg1.your-objectstorage.com",
    HETZNER_S3_REGION: "nbg1",
    HETZNER_S3_BUCKET: "igbo-uploads",
    HETZNER_S3_ACCESS_KEY_ID: "test-key",
    HETZNER_S3_SECRET_ACCESS_KEY: "test-secret",
    ENABLE_CLAMAV: "false",
    CLAMAV_HOST: "clamav",
    CLAMAV_PORT: 3310,
  },
}));

const mockFindProcessingFileUploads = vi.fn();
const mockFindPendingScanFileUploads = vi.fn();
const mockUpdateFileUpload = vi.fn();

vi.mock("@/db/queries/file-uploads", () => ({
  findProcessingFileUploads: (...args: unknown[]) => mockFindProcessingFileUploads(...args),
  findPendingScanFileUploads: (...args: unknown[]) => mockFindPendingScanFileUploads(...args),
  updateFileUpload: (...args: unknown[]) => mockUpdateFileUpload(...args),
}));

const mockCreateScannerService = vi.fn();
const mockVerifyMagicBytes = vi.fn();

vi.mock("@/services/scanner-service", () => ({
  createScannerService: (...args: unknown[]) => mockCreateScannerService(...args),
  verifyMagicBytes: (...args: unknown[]) => mockVerifyMagicBytes(...args),
}));

const mockFetchFileBuffer = vi.fn();
const mockDeleteObject = vi.fn();

vi.mock("@/services/file-upload-service", () => ({
  fetchFileBuffer: (...args: unknown[]) => mockFetchFileBuffer(...args),
  deleteObject: (...args: unknown[]) => mockDeleteObject(...args),
}));

const mockEventBusEmit = vi.fn();
vi.mock("@/services/event-bus", () => ({
  eventBus: { emit: (...args: unknown[]) => mockEventBusEmit(...args) },
}));

vi.mock("@/config/upload", () => ({
  IMAGE_SRCSET_WIDTHS: [400, 800, 1200] as const,
}));

// Mock dynamic imports used in the processing job
vi.mock("sharp", () => ({
  default: function () {
    return {
      resize: function () {
        return this;
      },
      webp: function () {
        return this;
      },
      avif: function () {
        return this;
      },
      toBuffer: vi.fn().mockResolvedValue(Buffer.from("processed")),
    };
  },
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: function () {
    return { send: vi.fn().mockResolvedValue({}) };
  },
  PutObjectCommand: function (p: unknown) {
    return p;
  },
}));

// Import module — side effect: calls registerJob (mocked)
import "./file-processing";
import { processFileRecord } from "./file-processing";

const dummyBuffer = Buffer.from("file content");

const makeFile = (overrides = {}) => ({
  id: "file-id-1",
  uploaderId: "user-123",
  objectKey: "uploads/user-123/file.jpg",
  originalFilename: "file.jpg",
  fileType: "image/jpeg",
  fileSize: 1024,
  status: "processing" as const,
  processedUrl: null,
  createdAt: new Date(),
  ...overrides,
});

const mockScanner = {
  scan: vi.fn().mockResolvedValue({ clean: true }),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFindProcessingFileUploads.mockResolvedValue([]);
  mockFindPendingScanFileUploads.mockResolvedValue([]);
  mockUpdateFileUpload.mockResolvedValue(undefined);
  mockDeleteObject.mockResolvedValue(undefined);
  mockFetchFileBuffer.mockResolvedValue(dummyBuffer);
  mockCreateScannerService.mockReturnValue(mockScanner);
  mockScanner.scan.mockResolvedValue({ clean: true });
  mockVerifyMagicBytes.mockResolvedValue({ clean: true });
  mockEventBusEmit.mockReturnValue(true);
});

// ─── Job registration ─────────────────────────────────────────────────────────

describe("file-processing job registration", () => {
  it("registers the job handler at module load time", () => {
    // handlerRef.current is set during module load (not cleared by vi.clearAllMocks)
    expect(handlerRef.current).toBeTypeOf("function");
  });

  it("job calls processFileRecord for each file in processing and pending_scan status", async () => {
    const file1 = makeFile({ id: "file-1", status: "processing" as const });
    const file2 = makeFile({
      id: "file-2",
      objectKey: "uploads/user-123/file2.pdf",
      status: "pending_scan" as const,
      fileType: "application/pdf",
    });

    mockFindProcessingFileUploads.mockResolvedValue([file1]);
    mockFindPendingScanFileUploads.mockResolvedValue([file2]);

    await handlerRef.current?.();

    expect(mockFetchFileBuffer).toHaveBeenCalledTimes(2);
    expect(mockFetchFileBuffer).toHaveBeenCalledWith(file1.objectKey);
    expect(mockFetchFileBuffer).toHaveBeenCalledWith(file2.objectKey);
  });
});

// ─── processFileRecord ────────────────────────────────────────────────────────

describe("processFileRecord", () => {
  it("quarantines when fetchFileBuffer throws (object missing in S3)", async () => {
    mockFetchFileBuffer.mockRejectedValue(new Error("NoSuchKey"));
    const file = makeFile();

    await processFileRecord(file, mockScanner);

    expect(mockUpdateFileUpload).toHaveBeenCalledWith(file.id, { status: "quarantined" });
    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "file.quarantined",
      expect.objectContaining({ reason: "fetch_failed" }),
    );
  });

  it("quarantines when virus scanner returns { clean: false }", async () => {
    mockScanner.scan.mockResolvedValue({ clean: false, reason: "virus: Eicar" });
    const file = makeFile();

    await processFileRecord(file, mockScanner);

    expect(mockDeleteObject).toHaveBeenCalledWith(file.objectKey);
    expect(mockUpdateFileUpload).toHaveBeenCalledWith(file.id, { status: "quarantined" });
    expect(mockEventBusEmit).toHaveBeenCalledWith("file.quarantined", expect.any(Object));
  });

  it("quarantines when verifyMagicBytes returns { clean: false }", async () => {
    mockVerifyMagicBytes.mockResolvedValue({
      clean: false,
      reason: "disallowed_type: application/x-msdownload",
    });
    const file = makeFile();

    await processFileRecord(file, mockScanner);

    expect(mockDeleteObject).toHaveBeenCalledWith(file.objectKey);
    expect(mockUpdateFileUpload).toHaveBeenCalledWith(file.id, { status: "quarantined" });
    expect(mockEventBusEmit).toHaveBeenCalledWith("file.quarantined", expect.any(Object));
  });

  it("sets status ready and processedUrl when both scans pass", async () => {
    const file = makeFile({ fileType: "application/pdf" }); // non-image: skip sharp

    await processFileRecord(file, mockScanner);

    expect(mockUpdateFileUpload).toHaveBeenCalledWith(
      file.id,
      expect.objectContaining({
        status: "ready",
        processedUrl: expect.stringContaining(file.objectKey),
      }),
    );
  });

  it("emits file.processed event on success", async () => {
    const file = makeFile({ fileType: "application/pdf" });

    await processFileRecord(file, mockScanner);

    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "file.processed",
      expect.objectContaining({
        fileUploadId: file.id,
        uploaderId: file.uploaderId,
        objectKey: file.objectKey,
      }),
    );
  });

  it("emits file.quarantined event on scan failure", async () => {
    mockVerifyMagicBytes.mockResolvedValue({ clean: false, reason: "disallowed_type: image/fake" });
    const file = makeFile();

    await processFileRecord(file, mockScanner);

    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "file.quarantined",
      expect.objectContaining({
        fileUploadId: file.id,
        uploaderId: file.uploaderId,
      }),
    );
  });

  it("sets status pending_scan on ClamAV TCP connection error (does NOT quarantine)", async () => {
    mockScanner.scan.mockRejectedValue(new Error("ECONNREFUSED"));
    const file = makeFile();

    await processFileRecord(file, mockScanner);

    expect(mockUpdateFileUpload).toHaveBeenCalledWith(file.id, { status: "pending_scan" });
    expect(mockDeleteObject).not.toHaveBeenCalled();
    expect(mockEventBusEmit).not.toHaveBeenCalledWith("file.quarantined", expect.any(Object));
  });

  it("always calls verifyMagicBytes with declared MIME type even when ClamAV scanner is used (after scan passes)", async () => {
    const clamavScanner = { scan: vi.fn().mockResolvedValue({ clean: true }) };
    const file = makeFile({ fileType: "application/pdf" });

    await processFileRecord(file, clamavScanner);

    expect(clamavScanner.scan).toHaveBeenCalledWith(file.objectKey, dummyBuffer);
    expect(mockVerifyMagicBytes).toHaveBeenCalledWith(dummyBuffer, "application/pdf");
  });
});
