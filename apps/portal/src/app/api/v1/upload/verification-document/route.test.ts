// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/file-uploads", () => ({ createFileUpload: vi.fn() }));
vi.mock("@/lib/s3-client", () => ({
  getPortalS3Client: vi.fn(() => ({ send: vi.fn().mockResolvedValue({}) })),
}));
vi.mock("@aws-sdk/client-s3", () => ({ PutObjectCommand: vi.fn() }));

import { auth } from "@igbo/auth";
import { createFileUpload } from "@igbo/db/queries/file-uploads";
import { POST } from "./route";

const mockSession = { user: { id: "employer-1" } };
const mockRecord = {
  id: "fu-1",
  uploaderId: "employer-1",
  objectKey: "portal/verification/employer-1/abc.pdf",
  originalFilename: "business-reg.pdf",
  fileType: "application/pdf",
  fileSize: 1024,
  status: "ready",
  processedUrl: null,
  createdAt: new Date(),
};

function makeFormDataRequest(file: File): Request {
  const formData = new FormData();
  formData.append("file", file);
  return new Request("https://jobs.igbo.com/api/v1/upload/verification-document", {
    method: "POST",
    headers: { Origin: "https://jobs.igbo.com", Host: "jobs.igbo.com" },
    body: formData,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(mockSession as never);
  vi.mocked(createFileUpload).mockResolvedValue(mockRecord as never);
});

describe("POST /api/v1/upload/verification-document", () => {
  it("uploads a PDF and returns file info", async () => {
    const file = new File(["content"], "business-reg.pdf", { type: "application/pdf" });
    const req = makeFormDataRequest(file);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.fileUploadId).toBe("fu-1");
    expect(body.data.originalFilename).toBe("business-reg.pdf");
  });

  it("uploads a JPEG image and returns file info", async () => {
    const file = new File(["img"], "photo.jpg", { type: "image/jpeg" });
    const req = makeFormDataRequest(file);
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const file = new File(["content"], "doc.pdf", { type: "application/pdf" });
    const req = makeFormDataRequest(file);
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for disallowed MIME type (docx)", async () => {
    const file = new File(["content"], "doc.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const req = makeFormDataRequest(file);
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain("Invalid file type");
  });

  it("returns 400 for file over 10MB", async () => {
    const bigContent = new Uint8Array(11 * 1024 * 1024);
    const file = new File([bigContent], "big.pdf", { type: "application/pdf" });
    const req = makeFormDataRequest(file);
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain("10MB");
  });

  it("returns 400 when no file field is present", async () => {
    const req = new Request("https://jobs.igbo.com/api/v1/upload/verification-document", {
      method: "POST",
      headers: { Origin: "https://jobs.igbo.com", Host: "jobs.igbo.com" },
      body: new FormData(),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
