// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-application-notes", () => ({
  createApplicationNote: vi.fn(),
  getNotesByApplicationId: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-applications", () => ({
  getApplicationDetailForEmployer: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-companies", () => ({
  getCompanyByOwnerId: vi.fn(),
}));

import { auth } from "@igbo/auth";
import {
  createApplicationNote,
  getNotesByApplicationId,
} from "@igbo/db/queries/portal-application-notes";
import { getApplicationDetailForEmployer } from "@igbo/db/queries/portal-applications";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
import { POST, GET } from "./route";

const VALID_APP_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const EMPLOYER_ID = "employer-1";
const COMPANY_ID = "cp-1";

const employerSession = {
  user: { id: EMPLOYER_ID, activePortalRole: "EMPLOYER" },
};

const mockCompany = {
  id: COMPANY_ID,
  ownerUserId: EMPLOYER_ID,
} as unknown as Awaited<ReturnType<typeof getCompanyByOwnerId>>;

const mockApplication = {
  id: VALID_APP_ID,
  jobId: "jp-1",
  seekerUserId: "seeker-1",
  status: "submitted",
  companyId: COMPANY_ID,
} as unknown as Awaited<ReturnType<typeof getApplicationDetailForEmployer>>;

const mockNote = {
  id: "note-1",
  applicationId: VALID_APP_ID,
  authorUserId: EMPLOYER_ID,
  authorName: "Employer Jane",
  content: "Strong candidate",
  createdAt: new Date("2026-04-11T10:00:00Z"),
};

function makePostRequest(appId: string, body: unknown): Request {
  return new Request(`https://jobs.igbo.com/api/v1/applications/${appId}/notes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://jobs.igbo.com",
      Host: "jobs.igbo.com",
    },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(appId: string): Request {
  return new Request(`https://jobs.igbo.com/api/v1/applications/${appId}/notes`, {
    method: "GET",
    headers: {
      Origin: "https://jobs.igbo.com",
      Host: "jobs.igbo.com",
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(
    employerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
  );
  vi.mocked(getCompanyByOwnerId).mockResolvedValue(mockCompany);
  vi.mocked(getApplicationDetailForEmployer).mockResolvedValue(mockApplication);
  vi.mocked(createApplicationNote).mockResolvedValue(mockNote);
  vi.mocked(getNotesByApplicationId).mockResolvedValue([mockNote]);
});

describe("POST /api/v1/applications/[applicationId]/notes", () => {
  it("returns 201 with note on success", async () => {
    const res = await POST(makePostRequest(VALID_APP_ID, { content: "Strong candidate" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe("note-1");
    expect(body.data.content).toBe("Strong candidate");
    expect(createApplicationNote).toHaveBeenCalledWith({
      applicationId: VALID_APP_ID,
      authorUserId: EMPLOYER_ID,
      content: "Strong candidate",
    });
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await POST(makePostRequest(VALID_APP_ID, { content: "Text" }));
    expect(res.status).toBe(401);
    expect(createApplicationNote).not.toHaveBeenCalled();
  });

  it("returns 403 when role is not EMPLOYER", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "seeker-1", activePortalRole: "JOB_SEEKER" },
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
    const res = await POST(makePostRequest(VALID_APP_ID, { content: "Text" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when applicationId is not a UUID", async () => {
    const res = await POST(makePostRequest("not-a-uuid", { content: "Text" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when content is empty", async () => {
    const res = await POST(makePostRequest(VALID_APP_ID, { content: "" }));
    expect(res.status).toBe(400);
    expect(createApplicationNote).not.toHaveBeenCalled();
  });

  it("returns 400 when content exceeds 2000 chars", async () => {
    const res = await POST(makePostRequest(VALID_APP_ID, { content: "a".repeat(2001) }));
    expect(res.status).toBe(400);
    expect(createApplicationNote).not.toHaveBeenCalled();
  });

  it("returns 404 when employer has no company", async () => {
    vi.mocked(getCompanyByOwnerId).mockResolvedValue(null);
    const res = await POST(makePostRequest(VALID_APP_ID, { content: "Text" }));
    expect(res.status).toBe(404);
    expect(createApplicationNote).not.toHaveBeenCalled();
  });

  it("returns 404 when application is not owned by employer's company", async () => {
    vi.mocked(getApplicationDetailForEmployer).mockResolvedValue(null);
    const res = await POST(makePostRequest(VALID_APP_ID, { content: "Text" }));
    expect(res.status).toBe(404);
    expect(createApplicationNote).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/applications/[applicationId]/notes", () => {
  it("returns 200 with notes array", async () => {
    const res = await GET(makeGetRequest(VALID_APP_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.notes).toHaveLength(1);
    expect(body.data.notes[0].id).toBe("note-1");
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await GET(makeGetRequest(VALID_APP_ID));
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is not EMPLOYER", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "seeker-1", activePortalRole: "JOB_SEEKER" },
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
    const res = await GET(makeGetRequest(VALID_APP_ID));
    expect(res.status).toBe(403);
  });

  it("returns 404 when application is not owned", async () => {
    vi.mocked(getApplicationDetailForEmployer).mockResolvedValue(null);
    const res = await GET(makeGetRequest(VALID_APP_ID));
    expect(res.status).toBe(404);
    expect(getNotesByApplicationId).not.toHaveBeenCalled();
  });
});
