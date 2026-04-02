// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

// vi.hoisted() ensures mock factories can access these variables
const { mockS3Send } = vi.hoisted(() => ({
  mockS3Send: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: {
    HETZNER_S3_ENDPOINT: "https://nbg1.your-objectstorage.com",
    HETZNER_S3_REGION: "nbg1",
    HETZNER_S3_BUCKET: "igbo-uploads",
    HETZNER_S3_ACCESS_KEY_ID: "test-key-id",
    HETZNER_S3_SECRET_ACCESS_KEY: "test-secret",
    HETZNER_S3_PUBLIC_URL: "https://igbo-uploads.nbg1.your-objectstorage.com",
  },
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: function () {
    return { send: mockS3Send };
  },
  PutObjectCommand: function (params: unknown) {
    return { ...(params as object), _type: "PutObjectCommand" };
  },
  GetObjectCommand: function (params: unknown) {
    return { ...(params as object), _type: "GetObjectCommand" };
  },
  DeleteObjectCommand: function (params: unknown) {
    return { ...(params as object), _type: "DeleteObjectCommand" };
  },
}));

const mockGetSignedUrl = vi.fn();
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
}));

const mockCreateFileUpload = vi.fn();
const mockGetFileUploadByKey = vi.fn();

vi.mock("@igbo/db/queries/file-uploads", () => ({
  createFileUpload: (...args: unknown[]) => mockCreateFileUpload(...args),
  getFileUploadByKey: (...args: unknown[]) => mockGetFileUploadByKey(...args),
}));

const mockRunJob = vi.fn();
vi.mock("@/server/jobs/job-runner", () => ({
  registerJob: vi.fn(),
  runJob: (...args: unknown[]) => mockRunJob(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { generatePresignedUploadUrl, confirmUpload } from "./file-upload-service";

const VALID_PARAMS = {
  uploaderId: "user-123",
  filename: "photo.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 1024 * 1024, // 1MB
  category: "image" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSignedUrl.mockResolvedValue("https://presigned-url.example.com/upload");
  mockCreateFileUpload.mockResolvedValue({
    id: "upload-record-id",
    uploaderId: "user-123",
    objectKey: "uploads/user-123/uuid-photo.jpg",
    originalFilename: "photo.jpg",
    fileType: "image/jpeg",
    fileSize: 1048576,
    status: "processing",
    processedUrl: null,
    createdAt: new Date(),
  });
  mockRunJob.mockResolvedValue(true);
});

describe("generatePresignedUploadUrl", () => {
  it("returns { uploadUrl, objectKey, fileUploadId } for valid params", async () => {
    const result = await generatePresignedUploadUrl(VALID_PARAMS);

    expect(result).toMatchObject({
      uploadUrl: "https://presigned-url.example.com/upload",
      fileUploadId: "upload-record-id",
    });
    expect(result.objectKey).toContain("uploads/user-123/");
    expect(mockCreateFileUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        uploaderId: "user-123",
        originalFilename: "photo.jpg",
        fileType: "image/jpeg",
        fileSize: 1048576,
      }),
    );
  });

  it("throws 400 for disallowed MIME type", async () => {
    const { ApiError } = await import("@/lib/api-error");

    await expect(
      generatePresignedUploadUrl({ ...VALID_PARAMS, mimeType: "application/x-msdownload" }),
    ).rejects.toThrow(ApiError);

    await expect(
      generatePresignedUploadUrl({ ...VALID_PARAMS, mimeType: "application/x-msdownload" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throws 400 when sizeBytes exceeds UPLOAD_SIZE_LIMITS[category]", async () => {
    const { ApiError } = await import("@/lib/api-error");
    const oversizedParams = {
      ...VALID_PARAMS,
      sizeBytes: 51 * 1024 * 1024, // 51MB > 50MB limit for images
    };

    await expect(generatePresignedUploadUrl(oversizedParams)).rejects.toThrow(ApiError);
    await expect(generatePresignedUploadUrl(oversizedParams)).rejects.toMatchObject({
      status: 400,
    });
  });

  it("respects profile_photo size limit (5MB)", async () => {
    const { ApiError } = await import("@/lib/api-error");
    const oversizedParams = {
      ...VALID_PARAMS,
      mimeType: "image/jpeg",
      category: "profile_photo" as const,
      sizeBytes: 6 * 1024 * 1024, // 6MB > 5MB limit
    };

    await expect(generatePresignedUploadUrl(oversizedParams)).rejects.toThrow(ApiError);
  });
});

describe("confirmUpload", () => {
  it("throws 404 when objectKey not found in DB", async () => {
    mockGetFileUploadByKey.mockResolvedValue(null);
    const { ApiError } = await import("@/lib/api-error");

    await expect(confirmUpload("nonexistent-key", "user-123")).rejects.toThrow(ApiError);
    await expect(confirmUpload("nonexistent-key", "user-123")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws 403 when uploaderId !== authenticatedUserId", async () => {
    mockGetFileUploadByKey.mockResolvedValue({
      id: "upload-id",
      uploaderId: "other-user",
      objectKey: "uploads/other-user/file.jpg",
      status: "processing",
    });
    const { ApiError } = await import("@/lib/api-error");

    await expect(confirmUpload("uploads/other-user/file.jpg", "user-123")).rejects.toThrow(
      ApiError,
    );
    await expect(confirmUpload("uploads/other-user/file.jpg", "user-123")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("calls runJob('file-processing') on success", async () => {
    mockGetFileUploadByKey.mockResolvedValue({
      id: "upload-id",
      uploaderId: "user-123",
      objectKey: "uploads/user-123/file.jpg",
      status: "processing",
    });

    await confirmUpload("uploads/user-123/file.jpg", "user-123");
    expect(mockRunJob).toHaveBeenCalledWith("file-processing");
  });
});
