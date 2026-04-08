// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-seeker-profiles", () => ({
  getSeekerProfileByUserId: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-seeker-cvs", () => ({
  listSeekerCvs: vi.fn(),
  countSeekerCvs: vi.fn(),
  createSeekerCv: vi.fn(),
}));
vi.mock("@igbo/db/queries/file-uploads", () => ({
  createFileUpload: vi.fn(),
}));
vi.mock("@aws-sdk/client-s3", () => ({
  // Must use class/regular function — arrow functions cannot be used with `new`
  PutObjectCommand: class MockPutObjectCommand {
    constructor(public input: unknown) {}
  },
}));
vi.mock("@/lib/s3-client", () => ({
  getPortalS3Client: vi.fn(() => ({ send: vi.fn().mockResolvedValue({}) })),
}));

import { auth } from "@igbo/auth";
import { getSeekerProfileByUserId } from "@igbo/db/queries/portal-seeker-profiles";
import { listSeekerCvs, countSeekerCvs, createSeekerCv } from "@igbo/db/queries/portal-seeker-cvs";
import { createFileUpload } from "@igbo/db/queries/file-uploads";
import { GET, POST } from "./route";

const seekerSession = { user: { id: "user-1", activePortalRole: "JOB_SEEKER" } };
const employerSession = { user: { id: "user-2", activePortalRole: "EMPLOYER" } };

const mockProfile = {
  id: "profile-uuid",
  userId: "user-1",
  headline: "Engineer",
  summary: null,
  skills: [],
  experienceJson: [],
  educationJson: [],
  visibility: "passive",
  consentMatching: false,
  consentEmployerView: false,
  consentMatchingChangedAt: null,
  consentEmployerViewChangedAt: null,
  onboardingCompletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockCvWithFile = {
  id: "cv-uuid",
  seekerProfileId: "profile-uuid",
  fileUploadId: "upload-uuid",
  label: "My CV",
  isDefault: true,
  createdAt: new Date(),
  file: {
    originalFilename: "resume.pdf",
    fileType: "application/pdf",
    fileSize: 1024,
    objectKey: "portal/cvs/user-1/abc.pdf",
    status: "processing",
  },
};

const mockFileUpload = {
  id: "upload-uuid",
  uploaderId: "user-1",
  objectKey: "portal/cvs/user-1/abc.pdf",
  originalFilename: "resume.pdf",
  fileType: "application/pdf",
  fileSize: 1024,
  status: "processing",
  processedUrl: null,
  createdAt: new Date(),
};

const mockCv = {
  id: "cv-uuid",
  seekerProfileId: "profile-uuid",
  fileUploadId: "upload-uuid",
  label: "My CV",
  isDefault: true,
  createdAt: new Date(),
};

function makeGetRequest(): Request {
  return new Request("https://jobs.igbo.com/api/v1/seekers/me/cvs", {
    method: "GET",
    headers: { Origin: "https://jobs.igbo.com", Host: "jobs.igbo.com" },
  });
}

function makePostRequest(file: File, label = "My CV"): Request {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("label", label);
  return new Request("https://jobs.igbo.com/api/v1/seekers/me/cvs", {
    method: "POST",
    headers: { Origin: "https://jobs.igbo.com", Host: "jobs.igbo.com" },
    body: formData,
  });
}

function makePdfFile(sizeBytes = 1024): File {
  const bytes = new Uint8Array(sizeBytes);
  return new File([bytes], "resume.pdf", { type: "application/pdf" });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(
    seekerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
  );
});

describe("GET /api/v1/seekers/me/cvs", () => {
  it("returns empty array when no CVs", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    vi.mocked(listSeekerCvs).mockResolvedValue([]);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it("returns CV list when CVs exist", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    vi.mocked(listSeekerCvs).mockResolvedValue([mockCvWithFile] as Awaited<
      ReturnType<typeof listSeekerCvs>
    >);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].label).toBe("My CV");
  });

  it("returns 403 for non-seeker role", async () => {
    vi.mocked(auth).mockResolvedValue(
      employerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    );
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(403);
  });

  it("returns 404 SEEKER_PROFILE_REQUIRED when no profile", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("PORTAL_ERRORS.SEEKER_PROFILE_REQUIRED");
  });
});

describe("POST /api/v1/seekers/me/cvs", () => {
  it("returns 201 and first CV is default (count=0)", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    vi.mocked(countSeekerCvs).mockResolvedValue(0);
    vi.mocked(createFileUpload).mockResolvedValue(
      mockFileUpload as Awaited<ReturnType<typeof createFileUpload>>,
    );
    vi.mocked(createSeekerCv).mockResolvedValue({ ...mockCv, isDefault: true } as Awaited<
      ReturnType<typeof createSeekerCv>
    >);
    const res = await POST(makePostRequest(makePdfFile()));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.isDefault).toBe(true);
    expect(vi.mocked(createSeekerCv).mock.calls[0]?.[0]).toMatchObject({ isDefault: true });
  });

  it("returns 201 and second CV is not default (count=1)", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    vi.mocked(countSeekerCvs).mockResolvedValue(1);
    vi.mocked(createFileUpload).mockResolvedValue(
      mockFileUpload as Awaited<ReturnType<typeof createFileUpload>>,
    );
    vi.mocked(createSeekerCv).mockResolvedValue({ ...mockCv, isDefault: false } as Awaited<
      ReturnType<typeof createSeekerCv>
    >);
    const res = await POST(makePostRequest(makePdfFile()));
    expect(res.status).toBe(201);
    expect(vi.mocked(createSeekerCv).mock.calls[0]?.[0]).toMatchObject({ isDefault: false });
  });

  it("returns 400 INVALID_FILE_TYPE for unsupported MIME", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    const textFile = new File(["hello"], "resume.txt", { type: "text/plain" });
    const res = await POST(makePostRequest(textFile));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("PORTAL_ERRORS.INVALID_FILE_TYPE");
  });

  it("returns 400 FILE_TOO_LARGE for file exceeding 10MB", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    const bigFile = makePdfFile(11 * 1024 * 1024);
    const res = await POST(makePostRequest(bigFile));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("PORTAL_ERRORS.FILE_TOO_LARGE");
  });

  it("returns 400 when label is missing from form data", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    const formData = new FormData();
    formData.append("file", makePdfFile());
    const req = new Request("https://jobs.igbo.com/api/v1/seekers/me/cvs", {
      method: "POST",
      headers: { Origin: "https://jobs.igbo.com", Host: "jobs.igbo.com" },
      body: formData,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 409 CV_LIMIT_REACHED when seeker already has 5 CVs", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    vi.mocked(countSeekerCvs).mockResolvedValue(5);
    const res = await POST(makePostRequest(makePdfFile()));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("PORTAL_ERRORS.CV_LIMIT_REACHED");
  });

  it("returns 403 for non-seeker role", async () => {
    vi.mocked(auth).mockResolvedValue(
      employerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    );
    const res = await POST(makePostRequest(makePdfFile()));
    expect(res.status).toBe(403);
  });

  it("returns 404 SEEKER_PROFILE_REQUIRED when no profile", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(null);
    const res = await POST(makePostRequest(makePdfFile()));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("PORTAL_ERRORS.SEEKER_PROFILE_REQUIRED");
  });

  it("accepts DOCX MIME type", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    vi.mocked(countSeekerCvs).mockResolvedValue(0);
    vi.mocked(createFileUpload).mockResolvedValue(
      mockFileUpload as Awaited<ReturnType<typeof createFileUpload>>,
    );
    vi.mocked(createSeekerCv).mockResolvedValue(
      mockCv as Awaited<ReturnType<typeof createSeekerCv>>,
    );
    const docxFile = new File([new Uint8Array(1024)], "resume.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const res = await POST(makePostRequest(docxFile));
    expect(res.status).toBe(201);
  });
});
