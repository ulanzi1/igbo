// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@/services/employer-verification-service", () => ({
  submitVerificationRequest: vi.fn(),
  getVerificationStatus: vi.fn(),
}));

import { auth } from "@igbo/auth";
import {
  submitVerificationRequest,
  getVerificationStatus,
} from "@/services/employer-verification-service";
import { POST, GET } from "./route";

const mockSession = { user: { id: "employer-1" } };
const mockVerification = {
  id: "ver-1",
  companyId: "company-1",
  submittedDocuments: [
    {
      fileUploadId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      objectKey: "portal/verification/employer-1/doc.pdf",
      originalFilename: "reg.pdf",
    },
  ],
  status: "pending",
  adminNotes: null,
  submittedAt: new Date(),
  reviewedAt: null,
  reviewedByAdminId: null,
  createdAt: new Date(),
};

// Valid UUID for document
const VALID_UUID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

function makePostRequest(companyId: string, body: unknown): Request {
  return new Request(`https://jobs.igbo.com/api/v1/companies/${companyId}/verification`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://jobs.igbo.com",
      Host: "jobs.igbo.com",
    },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(companyId: string): Request {
  return new Request(`https://jobs.igbo.com/api/v1/companies/${companyId}/verification`, {
    method: "GET",
    headers: { Host: "jobs.igbo.com" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(mockSession as never);
});

describe("POST /api/v1/companies/[companyId]/verification", () => {
  const validBody = {
    documents: [
      {
        fileUploadId: VALID_UUID,
        objectKey: "portal/verification/employer-1/doc.pdf",
        originalFilename: "reg.pdf",
      },
    ],
  };

  it("submits verification request and returns 201", async () => {
    vi.mocked(submitVerificationRequest).mockResolvedValue(mockVerification as never);
    const req = makePostRequest("company-1", validBody);
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(submitVerificationRequest).toHaveBeenCalledWith(
      "company-1",
      "employer-1",
      validBody.documents,
    );
  });

  it("returns 400 for empty documents array", async () => {
    const req = makePostRequest("company-1", { documents: [] });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for more than 3 documents", async () => {
    const docs = Array.from({ length: 4 }, (_, i) => ({
      fileUploadId: VALID_UUID,
      objectKey: `key-${i}`,
      originalFilename: `doc-${i}.pdf`,
    }));
    const req = makePostRequest("company-1", { documents: docs });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const req = makePostRequest("company-1", validBody);
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 409 when service throws VERIFICATION_ALREADY_PENDING", async () => {
    const { ApiError } = await import("@igbo/auth/api-error");
    vi.mocked(submitVerificationRequest).mockRejectedValue(
      new ApiError({ title: "Pending", status: 409 }),
    );
    const req = makePostRequest("company-1", validBody);
    const res = await POST(req);
    expect(res.status).toBe(409);
  });

  it("returns 403 when employer does not own company", async () => {
    const { ApiError } = await import("@igbo/auth/api-error");
    vi.mocked(submitVerificationRequest).mockRejectedValue(
      new ApiError({ title: "Forbidden", status: 403 }),
    );
    const req = makePostRequest("company-1", validBody);
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("https://jobs.igbo.com/api/v1/companies/company-1/verification", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://jobs.igbo.com",
        Host: "jobs.igbo.com",
      },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/companies/[companyId]/verification", () => {
  it("returns verification status", async () => {
    vi.mocked(getVerificationStatus).mockResolvedValue({
      status: "pending",
      latestVerification: mockVerification as never,
    });
    const req = makeGetRequest("company-1");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("pending");
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const req = makeGetRequest("company-1");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});
