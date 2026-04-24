// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/file-uploads", () => ({
  createFileUpload: vi.fn(),
}));

const mockS3Send = vi.fn().mockResolvedValue({});
const mockPutObjectCommandInstances: unknown[] = [];
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class MockS3Client {
    send = mockS3Send;
  },
  PutObjectCommand: class MockPutObjectCommand {
    constructor(public params: unknown) {
      mockPutObjectCommandInstances.push(params);
    }
  },
}));

import { auth } from "@igbo/auth";
import { createFileUpload } from "@igbo/db/queries/file-uploads";
import { POST } from "./route";

const mockSession = {
  user: { id: "user-123", activePortalRole: "EMPLOYER" },
};

function makeFileUploadRecord(
  overrides?: Partial<{
    id: string;
    uploaderId: string;
    objectKey: string;
    originalFilename: string;
    fileType: string;
    fileSize: number;
    status: "processing" | "pending_scan" | "ready" | "quarantined" | "deleted";
    processedUrl: string | null;
    createdAt: Date;
  }>,
) {
  return {
    id: "file-uuid",
    uploaderId: "user-123",
    objectKey: "portal/logos/user-123/uuid.png",
    originalFilename: "logo.png",
    fileType: "image/png",
    fileSize: 1024,
    status: "processing" as const,
    processedUrl: null,
    createdAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPutObjectCommandInstances.length = 0;
  mockS3Send.mockResolvedValue({});
  vi.mocked(auth).mockResolvedValue(
    mockSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
  );
  vi.mocked(createFileUpload).mockResolvedValue(makeFileUploadRecord());
  process.env.HETZNER_S3_BUCKET = "test-bucket";
  process.env.HETZNER_S3_REGION = "eu-central";
  process.env.HETZNER_S3_ACCESS_KEY_ID = "test-key";
  process.env.HETZNER_S3_SECRET_ACCESS_KEY = "test-secret";
  process.env.HETZNER_S3_PUBLIC_URL = "https://test-bucket.example.com";
});

function makeRequest(file?: File, category?: string): Request {
  const formData = new FormData();
  if (file) formData.append("file", file);
  if (category) formData.append("category", category);
  return new Request("https://jobs.igbo.com/api/v1/upload/file", {
    method: "POST",
    headers: { Origin: "https://jobs.igbo.com", Host: "jobs.igbo.com" },
    body: formData,
  });
}

// ── Logo category (backwards-compatible) ────────────────────────────────────

describe("POST /api/v1/upload/file — logo category (default)", () => {
  it("returns 401 for unauthenticated request", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 200 with fileUploadId and publicUrl for valid image upload", async () => {
    const file = new File(["data"], "logo.png", { type: "image/png" });
    const res = await POST(makeRequest(file));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.fileUploadId).toBe("file-uuid");
    expect(body.data.publicUrl).toContain("portal/logos/");
  });

  it("returns 400 for oversized file (>5MB)", async () => {
    const bigData = new Uint8Array(6 * 1024 * 1024);
    const file = new File([bigData], "big.png", { type: "image/png" });
    const res = await POST(makeRequest(file));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain("too large");
  });

  it("returns 400 for invalid file type (PDF is not allowed for logos)", async () => {
    const file = new File(["data"], "doc.pdf", { type: "application/pdf" });
    const res = await POST(makeRequest(file));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain("Invalid file type");
  });

  it("returns 400 when file field is missing", async () => {
    const formData = new FormData();
    const req = new Request("https://jobs.igbo.com/api/v1/upload/file", {
      method: "POST",
      headers: { Origin: "https://jobs.igbo.com", Host: "jobs.igbo.com" },
      body: formData,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain("Missing file field");
  });

  it("calls createFileUpload with correct parameters", async () => {
    const file = new File(["data"], "logo.webp", { type: "image/webp" });
    await POST(makeRequest(file));
    expect(createFileUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        uploaderId: "user-123",
        fileType: "image/webp",
        originalFilename: "logo.webp",
      }),
    );
  });

  it("missing category defaults to logo behavior", async () => {
    const file = new File(["data"], "logo.png", { type: "image/png" });
    const res = await POST(makeRequest(file)); // no category param
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.publicUrl).toContain("portal/logos/");
  });
});

// ── Message category ─────────────────────────────────────────────────────────

describe("POST /api/v1/upload/file — message category", () => {
  beforeEach(() => {
    vi.mocked(createFileUpload).mockResolvedValue(
      makeFileUploadRecord({
        objectKey: "portal/messages/user-123/uuid.pdf",
        status: "ready",
      }),
    );
  });

  it("accepts PDF and returns fileUploadId", async () => {
    const file = new File(["data"], "cv.pdf", { type: "application/pdf" });
    const res = await POST(makeRequest(file, "message"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.fileUploadId).toBe("file-uuid");
  });

  it("accepts .docx", async () => {
    const file = new File(["data"], "resume.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const res = await POST(makeRequest(file, "message"));
    expect(res.status).toBe(200);
  });

  it("accepts image/jpeg", async () => {
    const file = new File(["data"], "photo.jpg", { type: "image/jpeg" });
    const res = await POST(makeRequest(file, "message"));
    expect(res.status).toBe(200);
  });

  it("accepts text/plain", async () => {
    const file = new File(["data"], "notes.txt", { type: "text/plain" });
    const res = await POST(makeRequest(file, "message"));
    expect(res.status).toBe(200);
  });

  it("rejects unsupported type (.exe)", async () => {
    const file = new File(["data"], "malware.exe", { type: "application/octet-stream" });
    const res = await POST(makeRequest(file, "message"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain("Invalid file type");
  });

  it("rejects file > 10MB", async () => {
    const bigData = new Uint8Array(11 * 1024 * 1024);
    const file = new File([bigData], "large.pdf", { type: "application/pdf" });
    const res = await POST(makeRequest(file, "message"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain("too large");
  });

  it("accepts file up to 10MB", async () => {
    const data = new Uint8Array(9 * 1024 * 1024); // 9MB - within limit
    const file = new File([data], "big.pdf", { type: "application/pdf" });
    const res = await POST(makeRequest(file, "message"));
    expect(res.status).toBe(200);
  });

  it("S3 key uses portal/messages/ prefix", async () => {
    const file = new File(["data"], "cv.pdf", { type: "application/pdf" });
    await POST(makeRequest(file, "message"));
    const body = await (await POST(makeRequest(file, "message"))).json();
    expect(body.data.publicUrl).toContain("portal/messages/");
  });

  it("creates record with status: ready", async () => {
    const file = new File(["data"], "cv.pdf", { type: "application/pdf" });
    await POST(makeRequest(file, "message"));
    expect(createFileUpload).toHaveBeenCalledWith(expect.objectContaining({ status: "ready" }));
  });

  it("S3 PutObjectCommand includes ContentDisposition: attachment for non-image files", async () => {
    const file = new File(["data"], "cv.pdf", { type: "application/pdf" });
    await POST(makeRequest(file, "message"));
    const lastCmd = mockPutObjectCommandInstances[mockPutObjectCommandInstances.length - 1] as {
      ContentDisposition: string;
    };
    expect(lastCmd.ContentDisposition).toBe("attachment");
  });

  it("S3 PutObjectCommand uses ContentDisposition: inline for image files", async () => {
    const file = new File(["data"], "photo.png", { type: "image/png" });
    await POST(makeRequest(file, "message"));
    const lastCmd = mockPutObjectCommandInstances[mockPutObjectCommandInstances.length - 1] as {
      ContentDisposition: string;
    };
    expect(lastCmd.ContentDisposition).toBe("inline");
  });

  it("logo category still works with gif (backwards-compatible)", async () => {
    vi.mocked(createFileUpload).mockResolvedValue(makeFileUploadRecord());
    const file = new File(["data"], "anim.gif", { type: "image/gif" });
    const res = await POST(makeRequest(file, "logo"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.publicUrl).toContain("portal/logos/");
  });

  it("returns 400 for invalid category value", async () => {
    const file = new File(["data"], "test.png", { type: "image/png" });
    const res = await POST(makeRequest(file, "invalid-category"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain("Invalid upload category");
  });
});
