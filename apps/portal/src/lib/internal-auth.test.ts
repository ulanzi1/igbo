// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api-error", () => ({
  ApiError: class ApiError {
    status: number;
    title: string;
    constructor({ title, status }: { title: string; status: number }) {
      this.title = title;
      this.status = status;
    }
  },
}));

const makeRequest = (authHeader?: string) =>
  ({
    headers: {
      get: (name: string) => (name === "authorization" ? (authHeader ?? null) : null),
    },
  }) as unknown as Request;

describe("requireInternalAuth", () => {
  beforeEach(() => {
    vi.stubEnv("INTERNAL_JOB_SECRET", "test-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("passes when Authorization header matches secret", async () => {
    const { requireInternalAuth } = await import("./internal-auth");
    expect(() => requireInternalAuth(makeRequest("Bearer test-secret"))).not.toThrow();
  });

  it("throws 401 when Authorization header is missing", async () => {
    const { requireInternalAuth } = await import("./internal-auth");
    expect(() => requireInternalAuth(makeRequest())).toThrow();
  });

  it("throws 401 when Authorization header has wrong secret", async () => {
    const { requireInternalAuth } = await import("./internal-auth");
    expect(() => requireInternalAuth(makeRequest("Bearer wrong-secret"))).toThrow();
  });

  it("throws 401 when INTERNAL_JOB_SECRET env var is not set", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("INTERNAL_JOB_SECRET", "");
    const { requireInternalAuth } = await import("./internal-auth");
    expect(() => requireInternalAuth(makeRequest("Bearer any-secret"))).toThrow();
  });

  it("throws 401 when Authorization uses wrong scheme (Basic instead of Bearer)", async () => {
    const { requireInternalAuth } = await import("./internal-auth");
    expect(() => requireInternalAuth(makeRequest("Basic test-secret"))).toThrow();
  });
});
