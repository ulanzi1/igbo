// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@/services/application-submission-service", () => ({
  submit: vi.fn(),
}));

import { auth } from "@igbo/auth";
import { submit } from "@/services/application-submission-service";
import { POST } from "./route";
import type { PortalApplication } from "@igbo/db/schema/portal-applications";

const seekerSession = {
  user: { id: "seeker-1", activePortalRole: "JOB_SEEKER" },
};

const APPLICATION: Partial<PortalApplication> = {
  id: "app-1",
  jobId: "jp-1",
  seekerUserId: "seeker-1",
  status: "submitted",
};

function makeRequest(
  jobId: string,
  body: unknown = {},
  options: { headers?: Record<string, string>; method?: string } = {},
): Request {
  return new Request(`https://jobs.igbo.com/api/v1/jobs/${jobId}/apply`, {
    method: options.method ?? "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://jobs.igbo.com",
      Host: "jobs.igbo.com",
      ...options.headers,
    },
    body: options.method !== "GET" ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(
    seekerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
  );
  vi.mocked(submit).mockResolvedValue({
    application: APPLICATION as PortalApplication,
    replayed: false,
  });
});

describe("POST /api/v1/jobs/[jobId]/apply", () => {
  it("returns 201 on first-time application submit", async () => {
    const res = await POST(makeRequest("jp-1"));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe("app-1");
  });

  it("returns 200 on idempotent replay", async () => {
    vi.mocked(submit).mockResolvedValue({
      application: APPLICATION as PortalApplication,
      replayed: true,
    });
    const res = await POST(makeRequest("jp-1", {}, { headers: { "Idempotency-Key": "key-abc" } }));
    expect(res.status).toBe(200);
  });

  it("passes Idempotency-Key header to submit service", async () => {
    await POST(makeRequest("jp-1", {}, { headers: { "Idempotency-Key": "key-xyz" } }));
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "key-xyz" }));
  });

  it("passes null idempotencyKey when header absent", async () => {
    await POST(makeRequest("jp-1"));
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: null }));
  });

  it("returns 403 for non-seeker role", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "emp-1", activePortalRole: "EMPLOYER" },
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
    const res = await POST(makeRequest("jp-1"));
    expect(res.status).toBe(403);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await POST(makeRequest("jp-1"));
    expect(res.status).toBe(401);
  });

  it("returns 400 on validation error (invalid URL in portfolioLinks)", async () => {
    const res = await POST(makeRequest("jp-1", { portfolioLinks: ["not-a-url"] }));
    expect(res.status).toBe(400);
    expect(submit).not.toHaveBeenCalled();
  });

  it("returns 400 when portfolioLinks exceeds max 3", async () => {
    const res = await POST(
      makeRequest("jp-1", {
        portfolioLinks: ["https://a.com", "https://b.com", "https://c.com", "https://d.com"],
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when coverLetterText exceeds 2000 chars", async () => {
    const res = await POST(makeRequest("jp-1", { coverLetterText: "x".repeat(2001) }));
    expect(res.status).toBe(400);
  });

  it("forwards 409 DUPLICATE_APPLICATION from service", async () => {
    const { ApiError } = await import("@igbo/auth/api-error");
    vi.mocked(submit).mockRejectedValue(
      new ApiError({
        title: "Duplicate",
        status: 409,
        extensions: { code: "PORTAL_ERRORS.DUPLICATE_APPLICATION" },
      }),
    );
    const res = await POST(makeRequest("jp-1"));
    expect(res.status).toBe(409);
  });

  it("forwards 409 APPROVAL_INTEGRITY_VIOLATION for inactive job", async () => {
    const { ApiError } = await import("@igbo/auth/api-error");
    vi.mocked(submit).mockRejectedValue(
      new ApiError({
        title: "Not accepting",
        status: 409,
        extensions: { code: "PORTAL_ERRORS.APPROVAL_INTEGRITY_VIOLATION" },
      }),
    );
    const res = await POST(makeRequest("jp-1"));
    expect(res.status).toBe(409);
  });

  it("forwards 409 SEEKER_PROFILE_REQUIRED", async () => {
    const { ApiError } = await import("@igbo/auth/api-error");
    vi.mocked(submit).mockRejectedValue(
      new ApiError({
        title: "Profile required",
        status: 409,
        extensions: { code: "PORTAL_ERRORS.SEEKER_PROFILE_REQUIRED" },
      }),
    );
    const res = await POST(makeRequest("jp-1"));
    expect(res.status).toBe(409);
  });

  it("passes coverLetterText and selectedCvId to service", async () => {
    const validCvId = "a0b1c2d3-e4f5-6789-abcd-ef0123456789";
    await POST(makeRequest("jp-1", { coverLetterText: "Hello!", selectedCvId: validCvId }));
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        coverLetterText: "Hello!",
        selectedCvId: validCvId,
      }),
    );
  });

  it("passes jobId extracted from URL to service", async () => {
    await POST(makeRequest("jp-special-id"));
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ jobId: "jp-special-id" }));
  });
});
