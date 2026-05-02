// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/services/digest-sender", () => ({
  sendPendingDigests: vi.fn(),
}));
vi.mock("@/lib/api-middleware", () => ({
  withApiHandler: vi.fn((handler: (req: Request) => Promise<Response>, _opts?: unknown) => handler),
}));
vi.mock("@/lib/api-response", () => ({
  successResponse: vi.fn((data: unknown) => Response.json({ data }, { status: 200 })),
}));
vi.mock("@/lib/api-error", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor({ title, status }: { title: string; status: number }) {
      super(title);
      this.status = status;
    }
  },
}));

import { sendPendingDigests } from "@/services/digest-sender";
import { POST } from "./route";

const INTERNAL_SECRET = "test-secret";

function makeInternalReq(secret?: string): Request {
  return new Request("http://localhost/api/v1/internal/digest/send", {
    method: "POST",
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

describe("POST /api/v1/internal/digest/send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_JOB_SECRET = INTERNAL_SECRET;
  });

  it("sends pending digests and returns stats in 200 response", async () => {
    const stats = { processed: 5, emailsSent: 3, skipped: 2, errors: 0 };
    vi.mocked(sendPendingDigests).mockResolvedValue(stats);

    const res = await POST(makeInternalReq(INTERNAL_SECRET));

    expect(res.status).toBe(200);
    expect(sendPendingDigests).toHaveBeenCalledOnce();
    expect(sendPendingDigests).toHaveBeenCalledWith(expect.any(Date));
    const body = (await res.json()) as { data: typeof stats };
    expect(body.data).toEqual(stats);
  });

  it("returns zero stats when no users are due for digest", async () => {
    const emptyStats = { processed: 0, emailsSent: 0, skipped: 0, errors: 0 };
    vi.mocked(sendPendingDigests).mockResolvedValue(emptyStats);

    const res = await POST(makeInternalReq(INTERNAL_SECRET));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: typeof emptyStats };
    expect(body.data).toEqual(emptyStats);
  });

  it("throws when authorization header is missing (internal auth pattern)", async () => {
    await expect(POST(makeInternalReq())).rejects.toThrow();
    expect(sendPendingDigests).not.toHaveBeenCalled();
  });

  it("throws when authorization secret is wrong", async () => {
    await expect(POST(makeInternalReq("wrong-secret"))).rejects.toThrow();
    expect(sendPendingDigests).not.toHaveBeenCalled();
  });
});
