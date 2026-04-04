// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-companies", () => ({
  createCompanyProfile: vi.fn(),
  getCompanyByOwnerId: vi.fn(),
}));

import { auth } from "@igbo/auth";
import { createCompanyProfile, getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
import { POST, GET } from "./route";

const employerSession = {
  user: { id: "user-123", activePortalRole: "EMPLOYER" },
};

const mockProfile = {
  id: "company-uuid",
  ownerUserId: "user-123",
  name: "Acme Corp",
  logoUrl: null,
  description: null,
  industry: "technology",
  companySize: "11-50",
  cultureInfo: null,
  trustBadge: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeRequest(body: unknown, method = "POST"): Request {
  return new Request("https://jobs.igbo.com/api/v1/companies", {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: "https://jobs.igbo.com",
      Host: "jobs.igbo.com",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(
    employerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
  );
});

describe("POST /api/v1/companies", () => {
  it("creates a company profile and returns 201", async () => {
    vi.mocked(getCompanyByOwnerId).mockResolvedValue(null);
    vi.mocked(createCompanyProfile).mockResolvedValue(mockProfile);

    const req = makeRequest({ name: "Acme Corp", industry: "technology", companySize: "11-50" });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.name).toBe("Acme Corp");
  });

  it("returns 409 if profile already exists", async () => {
    vi.mocked(getCompanyByOwnerId).mockResolvedValue(mockProfile);

    const req = makeRequest({ name: "Duplicate Corp" });
    const res = await POST(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("PORTAL_ERRORS.DUPLICATE_COMPANY_PROFILE");
  });

  it("returns 403 for non-employer role", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-456", activePortalRole: "JOB_SEEKER" },
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);

    const req = makeRequest({ name: "Acme" });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 401 for unauthenticated request", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const req = makeRequest({ name: "Acme" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body (missing name)", async () => {
    vi.mocked(getCompanyByOwnerId).mockResolvedValue(null);

    const req = makeRequest({ description: "No name provided" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/companies", () => {
  it("returns employer's own profile", async () => {
    vi.mocked(getCompanyByOwnerId).mockResolvedValue(mockProfile);

    const req = new Request("https://jobs.igbo.com/api/v1/companies", {
      method: "GET",
      headers: { Host: "jobs.igbo.com" },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe("company-uuid");
  });

  it("returns null when no profile exists", async () => {
    vi.mocked(getCompanyByOwnerId).mockResolvedValue(null);

    const req = new Request("https://jobs.igbo.com/api/v1/companies", {
      method: "GET",
      headers: { Host: "jobs.igbo.com" },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeNull();
  });
});
