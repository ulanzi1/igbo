// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ─── Mock @igbo/auth/config ───────────────────────────────────────────────────
const mockAuth = vi.fn();

vi.mock("./config", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

import { getActivePortalRole, type PortalRole } from "./portal-role";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getActivePortalRole", () => {
  it("returns null when session is null (unauthenticated)", async () => {
    mockAuth.mockResolvedValue(null);
    const result = await getActivePortalRole();
    expect(result).toBeNull();
  });

  it("returns null when user has no portal roles assigned", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-1", role: "MEMBER", activePortalRole: null },
    });
    const result = await getActivePortalRole();
    expect(result).toBeNull();
  });

  it("returns JOB_SEEKER when user has JOB_SEEKER portal role", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-2", role: "MEMBER", activePortalRole: "JOB_SEEKER" },
    });
    const result = await getActivePortalRole();
    expect(result).toBe("JOB_SEEKER");
  });

  it("returns EMPLOYER when user has EMPLOYER portal role", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-3", role: "MEMBER", activePortalRole: "EMPLOYER" },
    });
    const result = await getActivePortalRole();
    expect(result).toBe("EMPLOYER");
  });

  it("returns JOB_ADMIN when user has JOB_ADMIN portal role", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-4", role: "ADMIN", activePortalRole: "JOB_ADMIN" },
    });
    const result = await getActivePortalRole();
    expect(result).toBe("JOB_ADMIN");
  });

  it("returns JOB_SEEKER (default priority) when user has both JOB_SEEKER and EMPLOYER", async () => {
    // The JWT callback sets activePortalRole with JOB_SEEKER priority already.
    // By the time we read it from session, it's always a single resolved value.
    mockAuth.mockResolvedValue({
      user: { id: "user-5", role: "MEMBER", activePortalRole: "JOB_SEEKER" },
    });
    const result = await getActivePortalRole();
    expect(result).toBe("JOB_SEEKER");
  });

  it("returns null when activePortalRole is undefined in session", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-6", role: "MEMBER" }, // no activePortalRole field
    });
    const result = await getActivePortalRole();
    expect(result).toBeNull();
  });

  it("community MEMBER role + JOB_SEEKER portal role coexist — returns JOB_SEEKER", async () => {
    // User has MEMBER as community role AND JOB_SEEKER portal role simultaneously
    mockAuth.mockResolvedValue({
      user: {
        id: "user-7",
        role: "MEMBER",
        accountStatus: "APPROVED",
        activePortalRole: "JOB_SEEKER",
      },
    });
    const result = await getActivePortalRole();
    expect(result).toBe("JOB_SEEKER");
  });
});

describe("PortalRole type", () => {
  it("includes all expected portal role values", () => {
    const roles: PortalRole[] = ["JOB_SEEKER", "EMPLOYER", "JOB_ADMIN"];
    expect(roles).toHaveLength(3);
    expect(roles).toContain("JOB_SEEKER");
    expect(roles).toContain("EMPLOYER");
    expect(roles).toContain("JOB_ADMIN");
  });
});
