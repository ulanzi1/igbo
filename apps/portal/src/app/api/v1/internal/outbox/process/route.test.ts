// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/services/outbox-poller", () => ({
  processOutboxBatch: vi.fn().mockResolvedValue(undefined),
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

import { processOutboxBatch } from "@/services/outbox-poller";
import { POST } from "./route";

const INTERNAL_SECRET = "test-secret";

function makeInternalReq(secret?: string): Request {
  return new Request("http://localhost/api/v1/internal/outbox/process", {
    method: "POST",
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

describe("POST /api/v1/internal/outbox/process", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_JOB_SECRET = INTERNAL_SECRET;
  });

  it("processes outbox batch and returns 200", async () => {
    const res = await POST(makeInternalReq(INTERNAL_SECRET));
    expect(res.status).toBe(200);
    expect(processOutboxBatch).toHaveBeenCalledOnce();
  });

  it("throws when authorization header is missing", async () => {
    await expect(POST(makeInternalReq())).rejects.toThrow();
  });

  it("throws when authorization secret is wrong", async () => {
    await expect(POST(makeInternalReq("wrong-secret"))).rejects.toThrow();
  });

  it("handles empty queue gracefully without error", async () => {
    vi.mocked(
      processOutboxBatch as unknown as (...args: unknown[]) => Promise<void>,
    ).mockResolvedValue(undefined);
    const res = await POST(makeInternalReq(INTERNAL_SECRET));
    expect(res.status).toBe(200);
  });
});
