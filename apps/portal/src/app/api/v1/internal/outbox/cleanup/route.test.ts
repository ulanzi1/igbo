// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/services/outbox-poller", () => ({
  cleanupProcessedOutboxEvents: vi.fn(),
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

import { cleanupProcessedOutboxEvents } from "@/services/outbox-poller";
import { POST } from "./route";

const INTERNAL_SECRET = "test-secret";

function makeInternalReq(secret?: string): Request {
  return new Request("http://localhost/api/v1/internal/outbox/cleanup", {
    method: "POST",
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

describe("POST /api/v1/internal/outbox/cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_JOB_SECRET = INTERNAL_SECRET;
  });

  it("purges old events and returns count", async () => {
    vi.mocked(cleanupProcessedOutboxEvents).mockResolvedValue(12);
    const res = await POST(makeInternalReq(INTERNAL_SECRET));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.deleted).toBe(12);
  });

  it("returns 0 when no old events to clean up", async () => {
    vi.mocked(cleanupProcessedOutboxEvents).mockResolvedValue(0);
    const res = await POST(makeInternalReq(INTERNAL_SECRET));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.deleted).toBe(0);
  });

  it("throws when authorization secret is wrong", async () => {
    await expect(POST(makeInternalReq("wrong-secret"))).rejects.toThrow();
  });
});
