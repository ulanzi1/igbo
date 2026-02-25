// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockRequireAuthenticatedSession = vi.fn();
const mockUpdateLanguagePreference = vi.fn();

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@/db/queries/auth-queries", () => ({
  updateLanguagePreference: (...args: unknown[]) => mockUpdateLanguagePreference(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { PATCH } from "./route";

const USER_ID = "user-uuid-1";

function makePatchRequest(body: unknown) {
  return new Request("https://example.com/api/v1/user/language", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Host: "example.com",
      Origin: "https://example.com",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID, role: "MEMBER" });
  mockUpdateLanguagePreference.mockResolvedValue(undefined);
});

describe("PATCH /api/v1/user/language", () => {
  it("returns 200 on valid locale change to ig", async () => {
    const req = makePatchRequest({ locale: "ig" });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.locale).toBe("ig");
  });

  it("returns 200 on valid locale change to en", async () => {
    const req = makePatchRequest({ locale: "en" });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.locale).toBe("en");
  });

  it("calls updateLanguagePreference with userId and locale", async () => {
    const req = makePatchRequest({ locale: "ig" });
    await PATCH(req);
    expect(mockUpdateLanguagePreference).toHaveBeenCalledWith(USER_ID, "ig");
  });

  it("returns 401 when not authenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const req = makePatchRequest({ locale: "ig" });
    const res = await PATCH(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid locale value", async () => {
    const req = makePatchRequest({ locale: "fr" });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing locale in body", async () => {
    const req = makePatchRequest({});
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("https://example.com/api/v1/user/language", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Host: "example.com",
        Origin: "https://example.com",
      },
      body: "not-json",
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("returns 500 on DB failure", async () => {
    mockUpdateLanguagePreference.mockRejectedValue(new Error("DB connection failed"));
    const req = makePatchRequest({ locale: "ig" });
    const res = await PATCH(req);
    expect(res.status).toBe(500);
  });
});
