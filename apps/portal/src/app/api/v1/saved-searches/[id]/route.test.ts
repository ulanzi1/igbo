// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@/services/saved-search-service", () => ({
  updateMySearch: vi.fn(),
  deleteMySearch: vi.fn(),
}));

import { auth } from "@igbo/auth";
import { updateMySearch, deleteMySearch } from "@/services/saved-search-service";
import { PATCH, DELETE } from "./route";

const seekerSession = { user: { id: "u-1", activePortalRole: "JOB_SEEKER" } };
const employerSession = { user: { id: "u-2", activePortalRole: "EMPLOYER" } };

const UPDATED_SEARCH = {
  id: "ss-1",
  userId: "u-1",
  name: "Updated",
  searchParamsJson: {},
  alertFrequency: "instant",
  lastAlertedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const BASE_URL = "http://localhost/api/v1/saved-searches/ss-1";

function makeRequest(method: string, body?: unknown) {
  return new Request(BASE_URL, {
    method,
    headers: {
      "content-type": "application/json",
      Origin: "http://localhost",
      Host: "localhost",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/v1/saved-searches/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await PATCH(makeRequest("PATCH", { name: "New" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-seeker", async () => {
    vi.mocked(auth).mockResolvedValue(
      employerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    );
    const res = await PATCH(makeRequest("PATCH", { name: "New" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid body", async () => {
    vi.mocked(auth).mockResolvedValue(
      seekerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    );
    const res = await PATCH(makeRequest("PATCH", { alertFrequency: "invalid_freq" }));
    expect(res.status).toBe(400);
  });

  it("updates successfully", async () => {
    vi.mocked(auth).mockResolvedValue(
      seekerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    );
    vi.mocked(updateMySearch).mockResolvedValue(
      UPDATED_SEARCH as ReturnType<typeof updateMySearch> extends Promise<infer T> ? T : never,
    );

    const res = await PATCH(makeRequest("PATCH", { alertFrequency: "instant" }));
    const body = (await res.json()) as { data: { search: unknown } };
    expect(res.status).toBe(200);
    expect(body.data.search).toBeTruthy();
    expect(updateMySearch).toHaveBeenCalledWith(
      "u-1",
      "ss-1",
      expect.objectContaining({ alertFrequency: "instant" }),
    );
  });

  it("propagates 404 from service", async () => {
    vi.mocked(auth).mockResolvedValue(
      seekerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    );
    const { ApiError } = await import("@/lib/api-error");
    vi.mocked(updateMySearch).mockRejectedValue(new ApiError({ title: "Not Found", status: 404 }));

    const res = await PATCH(makeRequest("PATCH", { name: "X" }));
    expect(res.status).toBe(404);
  });

  it("propagates 403 from service (ownership)", async () => {
    vi.mocked(auth).mockResolvedValue(
      seekerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    );
    const { ApiError } = await import("@/lib/api-error");
    vi.mocked(updateMySearch).mockRejectedValue(new ApiError({ title: "Forbidden", status: 403 }));

    const res = await PATCH(makeRequest("PATCH", { name: "X" }));
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/v1/saved-searches/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await DELETE(makeRequest("DELETE"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-seeker", async () => {
    vi.mocked(auth).mockResolvedValue(
      employerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    );
    const res = await DELETE(makeRequest("DELETE"));
    expect(res.status).toBe(403);
  });

  it("deletes successfully", async () => {
    vi.mocked(auth).mockResolvedValue(
      seekerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    );
    vi.mocked(deleteMySearch).mockResolvedValue(undefined);

    const res = await DELETE(makeRequest("DELETE"));
    const body = (await res.json()) as { data: { deleted: boolean } };
    expect(res.status).toBe(200);
    expect(body.data.deleted).toBe(true);
    expect(deleteMySearch).toHaveBeenCalledWith("u-1", "ss-1");
  });

  it("propagates 404 from service", async () => {
    vi.mocked(auth).mockResolvedValue(
      seekerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    );
    const { ApiError } = await import("@/lib/api-error");
    vi.mocked(deleteMySearch).mockRejectedValue(new ApiError({ title: "Not Found", status: 404 }));

    const res = await DELETE(makeRequest("DELETE"));
    expect(res.status).toBe(404);
  });
});
