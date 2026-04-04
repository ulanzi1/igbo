// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/file-uploads", () => ({
  createFileUpload: vi.fn(),
}));
const mockS3Send = vi.fn().mockResolvedValue({});
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class MockS3Client {
    send = mockS3Send;
  },
  PutObjectCommand: class MockPutObjectCommand {
    constructor(public params: unknown) {}
  },
}));

import { auth } from "@igbo/auth";
import { createFileUpload } from "@igbo/db/queries/file-uploads";
import { POST } from "./route";

const mockSession = {
  user: { id: "user-123", activePortalRole: "EMPLOYER" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockS3Send.mockResolvedValue({});
  vi.mocked(auth).mockResolvedValue(
    mockSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
  );
  vi.mocked(createFileUpload).mockResolvedValue({
    id: "file-uuid",
    uploaderId: "user-123",
    objectKey: "portal/logos/user-123/uuid.png",
    originalFilename: "logo.png",
    fileType: "image/png",
    fileSize: 1024,
    status: "processing",
    processedUrl: null,
    createdAt: new Date(),
  });
  process.env.HETZNER_S3_BUCKET = "test-bucket";
  process.env.HETZNER_S3_REGION = "eu-central";
  process.env.HETZNER_S3_ACCESS_KEY_ID = "test-key";
  process.env.HETZNER_S3_SECRET_ACCESS_KEY = "test-secret";
  process.env.HETZNER_S3_PUBLIC_URL = "https://test-bucket.example.com";
});

function makeUploadRequest(file?: File): Request {
  const formData = new FormData();
  if (file) {
    formData.append("file", file);
  }
  return new Request("https://jobs.igbo.com/api/v1/upload/file", {
    method: "POST",
    headers: {
      Origin: "https://jobs.igbo.com",
      Host: "jobs.igbo.com",
    },
    body: formData,
  });
}

describe("POST /api/v1/upload/file", () => {
  it("returns 401 for unauthenticated request", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const req = makeUploadRequest();
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 200 with fileUploadId and publicUrl for valid image upload", async () => {
    const file = new File(["data"], "logo.png", { type: "image/png" });
    const req = makeUploadRequest(file);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.fileUploadId).toBe("file-uuid");
    expect(body.data.publicUrl).toContain("portal/logos/");
  });

  it("returns 400 for oversized file", async () => {
    const bigData = new Uint8Array(6 * 1024 * 1024); // 6MB
    const file = new File([bigData], "big.png", { type: "image/png" });
    const req = makeUploadRequest(file);
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain("too large");
  });

  it("returns 400 for invalid file type", async () => {
    const file = new File(["data"], "doc.pdf", { type: "application/pdf" });
    const req = makeUploadRequest(file);
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain("Invalid file type");
  });

  it("returns 400 when file field is missing", async () => {
    const formData = new FormData();
    const req = new Request("https://jobs.igbo.com/api/v1/upload/file", {
      method: "POST",
      headers: {
        Origin: "https://jobs.igbo.com",
        Host: "jobs.igbo.com",
      },
      body: formData,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain("Missing file field");
  });

  it("calls createFileUpload with correct parameters", async () => {
    const file = new File(["data"], "logo.webp", { type: "image/webp" });
    const req = makeUploadRequest(file);
    await POST(req);
    expect(createFileUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        uploaderId: "user-123",
        fileType: "image/webp",
        originalFilename: "logo.webp",
      }),
    );
  });
});
