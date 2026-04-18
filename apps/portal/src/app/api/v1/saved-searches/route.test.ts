// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@/services/saved-search-service", () => ({
  saveSavedSearch: vi.fn(),
  getMySearches: vi.fn(),
}));

import { auth } from "@igbo/auth";
import { saveSavedSearch, getMySearches } from "@/services/saved-search-service";
import { GET, POST } from "./route";

const seekerSession = { user: { id: "u-1", activePortalRole: "JOB_SEEKER" } };
const employerSession = { user: { id: "u-2", activePortalRole: "EMPLOYER" } };

const SAVED_SEARCH = {
  id: "ss-1",
  userId: "u-1",
  name: "Lagos Engineers",
  searchParamsJson: {},
  alertFrequency: "daily",
  lastAlertedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const VALID_BODY = {
  searchParams: { sort: "relevance", limit: 20 },
  alertFrequency: "daily",
};

beforeEach(() => {
  vi.clearAllMocks();
});

function makeRequest(
  method: string,
  body?: unknown,
  url = "http://localhost/api/v1/saved-searches",
) {
  return new Request(url, {
    method,
    headers: {
      "content-type": "application/json",
      Origin: "http://localhost",
      Host: "localhost",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("GET /api/v1/saved-searches", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(401);
  });

  it("returns empty array for non-seeker", async () => {
    vi.mocked(auth).mockResolvedValue(
      employerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    );
    const res = await GET(makeRequest("GET"));
    const body = (await res.json()) as { data: { searches: unknown[] } };
    expect(res.status).toBe(200);
    expect(body.data.searches).toEqual([]);
  });

  it("returns searches for authenticated seeker", async () => {
    vi.mocked(auth).mockResolvedValue(
      seekerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    );
    vi.mocked(getMySearches).mockResolvedValue([SAVED_SEARCH] as ReturnType<
      typeof getMySearches
    > extends Promise<infer T>
      ? T
      : never);

    const res = await GET(makeRequest("GET"));
    const body = (await res.json()) as { data: { searches: unknown[] } };
    expect(res.status).toBe(200);
    expect(body.data.searches).toHaveLength(1);
  });
});

describe("POST /api/v1/saved-searches", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const res = await POST(makeRequest("POST", VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-seeker", async () => {
    vi.mocked(auth).mockResolvedValue(
      employerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    );
    const res = await POST(makeRequest("POST", VALID_BODY));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid body", async () => {
    vi.mocked(auth).mockResolvedValue(
      seekerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    );
    const res = await POST(makeRequest("POST", { alertFrequency: "invalid" }));
    expect(res.status).toBe(400);
  });

  it("creates saved search successfully", async () => {
    vi.mocked(auth).mockResolvedValue(
      seekerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    );
    vi.mocked(saveSavedSearch).mockResolvedValue(
      SAVED_SEARCH as ReturnType<typeof saveSavedSearch> extends Promise<infer T> ? T : never,
    );

    const res = await POST(makeRequest("POST", VALID_BODY));
    const body = (await res.json()) as { data: { search: unknown } };
    expect(res.status).toBe(201);
    expect(body.data.search).toBeTruthy();
    expect(saveSavedSearch).toHaveBeenCalledWith(
      "u-1",
      expect.objectContaining({ alertFrequency: "daily" }),
    );
  });

  it("propagates 409 from service", async () => {
    vi.mocked(auth).mockResolvedValue(
      seekerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    );
    const { ApiError } = await import("@/lib/api-error");
    vi.mocked(saveSavedSearch).mockRejectedValue(
      new ApiError({ title: "Conflict", status: 409, detail: "Maximum 10" }),
    );

    const res = await POST(makeRequest("POST", VALID_BODY));
    expect(res.status).toBe(409);
  });
});
