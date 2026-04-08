// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-seeker-profiles", () => ({
  getSeekerProfileByUserId: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-seeker-cvs", () => ({
  getSeekerCvById: vi.fn(),
  updateSeekerCv: vi.fn(),
  setDefaultCv: vi.fn(),
  deleteSeekerCvWithFile: vi.fn(),
}));

import { auth } from "@igbo/auth";
import { getSeekerProfileByUserId } from "@igbo/db/queries/portal-seeker-profiles";
import {
  getSeekerCvById,
  updateSeekerCv,
  setDefaultCv,
  deleteSeekerCvWithFile,
} from "@igbo/db/queries/portal-seeker-cvs";
import { PATCH, DELETE } from "./route";

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
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockCv = {
  id: "cv-uuid",
  seekerProfileId: "profile-uuid",
  fileUploadId: "upload-uuid",
  label: "My CV",
  isDefault: false,
  createdAt: new Date(),
  file: {
    originalFilename: "resume.pdf",
    fileType: "application/pdf",
    fileSize: 1024,
    objectKey: "portal/cvs/user-1/abc.pdf",
    status: "processing",
  },
};

function makePatchRequest(cvId: string, body: unknown): Request {
  return new Request(`https://jobs.igbo.com/api/v1/seekers/me/cvs/${cvId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://jobs.igbo.com",
      Host: "jobs.igbo.com",
    },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(cvId: string): Request {
  return new Request(`https://jobs.igbo.com/api/v1/seekers/me/cvs/${cvId}`, {
    method: "DELETE",
    headers: { Origin: "https://jobs.igbo.com", Host: "jobs.igbo.com" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(
    seekerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
  );
});

describe("PATCH /api/v1/seekers/me/cvs/[cvId]", () => {
  it("updates label and returns updated CV", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    vi.mocked(getSeekerCvById)
      .mockResolvedValueOnce(mockCv as Awaited<ReturnType<typeof getSeekerCvById>>) // ownership check
      .mockResolvedValueOnce({ ...mockCv, label: "Updated Label" } as Awaited<
        ReturnType<typeof getSeekerCvById>
      >); // re-fetch
    vi.mocked(updateSeekerCv).mockResolvedValue({ ...mockCv, label: "Updated Label" } as Awaited<
      ReturnType<typeof updateSeekerCv>
    >);
    const res = await PATCH(makePatchRequest("cv-uuid", { label: "Updated Label" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.label).toBe("Updated Label");
  });

  it("sets CV as default and returns updated CV", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    vi.mocked(getSeekerCvById)
      .mockResolvedValueOnce(mockCv as Awaited<ReturnType<typeof getSeekerCvById>>)
      .mockResolvedValueOnce({ ...mockCv, isDefault: true } as Awaited<
        ReturnType<typeof getSeekerCvById>
      >);
    vi.mocked(setDefaultCv).mockResolvedValue({ ...mockCv, isDefault: true } as Awaited<
      ReturnType<typeof setDefaultCv>
    >);
    const res = await PATCH(makePatchRequest("cv-uuid", { isDefault: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.isDefault).toBe(true);
    expect(vi.mocked(setDefaultCv)).toHaveBeenCalledWith("profile-uuid", "cv-uuid");
  });

  it("returns 400 for invalid body (no fields)", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    const res = await PATCH(makePatchRequest("cv-uuid", {}));
    expect(res.status).toBe(400);
  });

  it("returns 403 for non-seeker role", async () => {
    vi.mocked(auth).mockResolvedValue(
      employerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    );
    const res = await PATCH(makePatchRequest("cv-uuid", { label: "Test" }));
    expect(res.status).toBe(403);
  });

  it("returns 404 SEEKER_PROFILE_REQUIRED when no profile", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(null);
    const res = await PATCH(makePatchRequest("cv-uuid", { label: "Test" }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("PORTAL_ERRORS.SEEKER_PROFILE_REQUIRED");
  });

  it("returns 404 NOT_FOUND when CV does not belong to profile", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    vi.mocked(getSeekerCvById).mockResolvedValue({
      ...mockCv,
      seekerProfileId: "other-profile",
    } as Awaited<ReturnType<typeof getSeekerCvById>>);
    const res = await PATCH(makePatchRequest("cv-uuid", { label: "Test" }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("PORTAL_ERRORS.NOT_FOUND");
  });

  it("returns 404 NOT_FOUND when CV does not exist", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    vi.mocked(getSeekerCvById).mockResolvedValue(null);
    const res = await PATCH(makePatchRequest("nonexistent", { label: "Test" }));
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/v1/seekers/me/cvs/[cvId]", () => {
  it("deletes CV and returns 204", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    vi.mocked(getSeekerCvById).mockResolvedValue(
      mockCv as Awaited<ReturnType<typeof getSeekerCvById>>,
    );
    vi.mocked(deleteSeekerCvWithFile).mockResolvedValue({ deletedDefaultPromoted: null });
    const res = await DELETE(makeDeleteRequest("cv-uuid"));
    expect(res.status).toBe(204);
    expect(vi.mocked(deleteSeekerCvWithFile)).toHaveBeenCalledWith("cv-uuid");
  });

  it("returns 403 for non-seeker role", async () => {
    vi.mocked(auth).mockResolvedValue(
      employerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    );
    const res = await DELETE(makeDeleteRequest("cv-uuid"));
    expect(res.status).toBe(403);
  });

  it("returns 404 SEEKER_PROFILE_REQUIRED when no profile", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(null);
    const res = await DELETE(makeDeleteRequest("cv-uuid"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("PORTAL_ERRORS.SEEKER_PROFILE_REQUIRED");
  });

  it("returns 404 NOT_FOUND when CV does not belong to profile", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    vi.mocked(getSeekerCvById).mockResolvedValue({
      ...mockCv,
      seekerProfileId: "other-profile",
    } as Awaited<ReturnType<typeof getSeekerCvById>>);
    const res = await DELETE(makeDeleteRequest("cv-uuid"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("PORTAL_ERRORS.NOT_FOUND");
  });
});
