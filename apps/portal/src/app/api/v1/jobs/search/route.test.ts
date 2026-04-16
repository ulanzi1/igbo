// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({ getLocale: vi.fn().mockResolvedValue("en") }));
vi.mock("@/services/job-search-service", () => ({ searchJobs: vi.fn() }));
vi.mock("@/lib/api-middleware", () => ({
  withApiHandler:
    (handler: (req: Request) => Promise<Response>, _opts?: unknown) =>
    async (req: Request): Promise<Response> => {
      try {
        return await handler(req);
      } catch (err: unknown) {
        const e = err as { title?: string; status?: number; detail?: string };
        const status = e.status ?? 500;
        return Response.json(
          { title: e.title ?? "Internal Server Error", status, detail: e.detail },
          { status },
        );
      }
    },
}));

import { getLocale } from "next-intl/server";
import { searchJobs } from "@/services/job-search-service";
import { GET } from "./route";
import type { JobSearchResponse } from "@/lib/validations/job-search";

const EMPTY_RESPONSE: JobSearchResponse = {
  results: [],
  facets: {
    location: [],
    employmentType: [],
    industry: [],
    salaryRange: [],
  },
  pagination: { nextCursor: null, totalCount: 0, effectiveSort: "relevance" },
};

function makeRequest(url: string): Request {
  return new Request(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(searchJobs).mockResolvedValue(EMPTY_RESPONSE);
  vi.mocked(getLocale).mockResolvedValue("en");
});

describe("GET /api/v1/jobs/search — happy path", () => {
  it("returns 200 with all expected top-level keys on valid query", async () => {
    const req = makeRequest("http://localhost:3001/api/v1/jobs/search?query=engineer");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty("results");
    expect(body.data).toHaveProperty("facets");
    expect(body.data).toHaveProperty("pagination");
  });

  it("calls searchJobs with the parsed request and locale", async () => {
    const req = makeRequest(
      "http://localhost:3001/api/v1/jobs/search?query=developer&sort=date&limit=10",
    );
    await GET(req);

    expect(searchJobs).toHaveBeenCalledWith(
      expect.objectContaining({ query: "developer", sort: "date", limit: 10 }),
      "en",
    );
  });

  it("sets Cache-Control header with s-maxage=60", async () => {
    const req = makeRequest("http://localhost:3001/api/v1/jobs/search");
    const res = await GET(req);

    expect(res.headers.get("Cache-Control")).toContain("s-maxage=60");
  });
});

describe("GET /api/v1/jobs/search — validation errors", () => {
  it("returns 400 for invalid sort value", async () => {
    const req = makeRequest("http://localhost:3001/api/v1/jobs/search?sort=popularity");
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.title).toContain("Validation Error");
  });

  it("returns 400 for limit=0", async () => {
    const req = makeRequest("http://localhost:3001/api/v1/jobs/search?limit=0");
    const res = await GET(req);

    expect(res.status).toBe(400);
  });

  it("returns 400 for limit=51", async () => {
    const req = makeRequest("http://localhost:3001/api/v1/jobs/search?limit=51");
    const res = await GET(req);

    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/jobs/search — multi-value filters", () => {
  it("passes multiple location values as array to searchJobs", async () => {
    const req = makeRequest(
      "http://localhost:3001/api/v1/jobs/search?location=Lagos&location=Toronto",
    );
    await GET(req);

    expect(searchJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({ location: ["Lagos", "Toronto"] }),
      }),
      "en",
    );
  });

  it("passes multiple employmentType values as array", async () => {
    const req = makeRequest(
      "http://localhost:3001/api/v1/jobs/search?employmentType=full_time&employmentType=contract",
    );
    await GET(req);

    expect(searchJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({ employmentType: ["full_time", "contract"] }),
      }),
      "en",
    );
  });

  it("passes multiple industry values as array", async () => {
    const req = makeRequest(
      "http://localhost:3001/api/v1/jobs/search?industry=Technology&industry=Finance",
    );
    await GET(req);

    expect(searchJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({ industry: ["Technology", "Finance"] }),
      }),
      "en",
    );
  });
});

describe("GET /api/v1/jobs/search — locale switching", () => {
  it("passes locale=ig to searchJobs when next-intl returns ig", async () => {
    vi.mocked(getLocale).mockResolvedValue("ig");

    const req = makeRequest("http://localhost:3001/api/v1/jobs/search?query=onye");
    await GET(req);

    expect(searchJobs).toHaveBeenCalledWith(expect.objectContaining({ query: "onye" }), "ig");
  });

  it("defaults to en locale when getLocale returns unsupported locale", async () => {
    vi.mocked(getLocale).mockResolvedValue("fr" as never);

    const req = makeRequest("http://localhost:3001/api/v1/jobs/search");
    await GET(req);

    expect(searchJobs).toHaveBeenCalledWith(expect.anything(), "en");
  });
});

describe("GET /api/v1/jobs/search — cursor passthrough", () => {
  it("passes cursor to searchJobs", async () => {
    const req = makeRequest("http://localhost:3001/api/v1/jobs/search?cursor=abc123");
    await GET(req);

    expect(searchJobs).toHaveBeenCalledWith(expect.objectContaining({ cursor: "abc123" }), "en");
  });
});

describe("GET /api/v1/jobs/search — strict boolean params (review fix H3)", () => {
  it("returns 400 when remote=1 (not exactly 'true'/'false')", async () => {
    const req = makeRequest("http://localhost:3001/api/v1/jobs/search?remote=1");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.title).toContain("Validation Error");
  });

  it("returns 400 when remote=yes (not exactly 'true'/'false')", async () => {
    const req = makeRequest("http://localhost:3001/api/v1/jobs/search?remote=yes");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when culturalContextDiasporaFriendly=YES (case-sensitive)", async () => {
    const req = makeRequest(
      "http://localhost:3001/api/v1/jobs/search?culturalContextDiasporaFriendly=YES",
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("accepts remote=true → filters.remote = true", async () => {
    const req = makeRequest("http://localhost:3001/api/v1/jobs/search?remote=true");
    await GET(req);
    expect(searchJobs).toHaveBeenCalledWith(
      expect.objectContaining({ filters: expect.objectContaining({ remote: true }) }),
      "en",
    );
  });

  it("folds remote=false into filter-absent — no `remote` key in filters (review fix M1)", async () => {
    const req = makeRequest("http://localhost:3001/api/v1/jobs/search?remote=false");
    await GET(req);
    const calledWith = vi.mocked(searchJobs).mock.calls[0]?.[0];
    // Either filters is undefined, or filters exists without a `remote` key
    const hasRemote =
      calledWith?.filters !== undefined && "remote" in (calledWith.filters as object);
    expect(hasRemote).toBe(false);
  });
});

describe("GET /api/v1/jobs/search — culturalContext flat params", () => {
  it("reconstructs culturalContext object from flat query params", async () => {
    const req = makeRequest(
      "http://localhost:3001/api/v1/jobs/search?culturalContextDiasporaFriendly=true&culturalContextIgboPreferred=false",
    );
    await GET(req);

    expect(searchJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({
          culturalContext: expect.objectContaining({ diasporaFriendly: true }),
        }),
      }),
      "en",
    );
  });
});
