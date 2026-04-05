// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));

import { auth } from "@igbo/auth";
import { ApiError } from "@igbo/auth/api-error";
import {
  requireEmployerRole,
  requireJobSeekerRole,
  requireJobAdminRole,
} from "./portal-permissions";
import { PORTAL_ERRORS } from "./portal-errors";

function makeSession(activePortalRole: string | null | undefined) {
  return {
    user: {
      id: "user-1",
      role: "MEMBER" as const,
      accountStatus: "APPROVED",
      profileCompleted: true,
      membershipTier: "BASIC" as const,
      activePortalRole,
    },
    expires: new Date(Date.now() + 86400000).toISOString(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// requireEmployerRole
// ---------------------------------------------------------------------------
describe("requireEmployerRole", () => {
  it("returns session when activePortalRole is EMPLOYER", async () => {
    vi.mocked(auth).mockResolvedValue(
      makeSession("EMPLOYER") as unknown as Awaited<ReturnType<typeof auth>>,
    );
    const session = await requireEmployerRole();
    expect(session.user.activePortalRole).toBe("EMPLOYER");
  });

  it("throws 403 with ROLE_MISMATCH when activePortalRole is JOB_SEEKER", async () => {
    vi.mocked(auth).mockResolvedValue(
      makeSession("JOB_SEEKER") as unknown as Awaited<ReturnType<typeof auth>>,
    );
    await expect(requireEmployerRole()).rejects.toMatchObject({
      status: 403,
      extensions: { code: PORTAL_ERRORS.ROLE_MISMATCH },
    });
  });

  it("throws 403 with ROLE_MISMATCH when activePortalRole is null", async () => {
    vi.mocked(auth).mockResolvedValue(
      makeSession(null) as unknown as Awaited<ReturnType<typeof auth>>,
    );
    await expect(requireEmployerRole()).rejects.toMatchObject({
      status: 403,
      extensions: { code: PORTAL_ERRORS.ROLE_MISMATCH },
    });
  });

  it("throws 401 when no session", async () => {
    vi.mocked(auth).mockResolvedValue(null as unknown as Awaited<ReturnType<typeof auth>>);
    await expect(requireEmployerRole()).rejects.toMatchObject({ status: 401 });
  });

  it("throws ApiError instance on role mismatch", async () => {
    vi.mocked(auth).mockResolvedValue(
      makeSession("JOB_SEEKER") as unknown as Awaited<ReturnType<typeof auth>>,
    );
    try {
      await requireEmployerRole();
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
    }
  });
});

// ---------------------------------------------------------------------------
// requireJobSeekerRole
// ---------------------------------------------------------------------------
describe("requireJobSeekerRole", () => {
  it("returns session when activePortalRole is JOB_SEEKER", async () => {
    vi.mocked(auth).mockResolvedValue(
      makeSession("JOB_SEEKER") as unknown as Awaited<ReturnType<typeof auth>>,
    );
    const session = await requireJobSeekerRole();
    expect(session.user.activePortalRole).toBe("JOB_SEEKER");
  });

  it("throws 403 with ROLE_MISMATCH when activePortalRole is EMPLOYER", async () => {
    vi.mocked(auth).mockResolvedValue(
      makeSession("EMPLOYER") as unknown as Awaited<ReturnType<typeof auth>>,
    );
    await expect(requireJobSeekerRole()).rejects.toMatchObject({
      status: 403,
      extensions: { code: PORTAL_ERRORS.ROLE_MISMATCH },
    });
  });

  it("throws 401 when no session", async () => {
    vi.mocked(auth).mockResolvedValue(null as unknown as Awaited<ReturnType<typeof auth>>);
    await expect(requireJobSeekerRole()).rejects.toMatchObject({ status: 401 });
  });
});

// ---------------------------------------------------------------------------
// requireJobAdminRole
// ---------------------------------------------------------------------------
describe("requireJobAdminRole", () => {
  it("returns session when activePortalRole is JOB_ADMIN", async () => {
    vi.mocked(auth).mockResolvedValue(
      makeSession("JOB_ADMIN") as unknown as Awaited<ReturnType<typeof auth>>,
    );
    const session = await requireJobAdminRole();
    expect(session.user.activePortalRole).toBe("JOB_ADMIN");
  });

  it("throws 403 with ROLE_MISMATCH when activePortalRole is EMPLOYER", async () => {
    vi.mocked(auth).mockResolvedValue(
      makeSession("EMPLOYER") as unknown as Awaited<ReturnType<typeof auth>>,
    );
    await expect(requireJobAdminRole()).rejects.toMatchObject({
      status: 403,
      extensions: { code: PORTAL_ERRORS.ROLE_MISMATCH },
    });
  });

  it("throws 403 with ROLE_MISMATCH when activePortalRole is JOB_SEEKER", async () => {
    vi.mocked(auth).mockResolvedValue(
      makeSession("JOB_SEEKER") as unknown as Awaited<ReturnType<typeof auth>>,
    );
    await expect(requireJobAdminRole()).rejects.toMatchObject({
      status: 403,
      extensions: { code: PORTAL_ERRORS.ROLE_MISMATCH },
    });
  });

  it("throws 401 when no session", async () => {
    vi.mocked(auth).mockResolvedValue(null as unknown as Awaited<ReturnType<typeof auth>>);
    await expect(requireJobAdminRole()).rejects.toMatchObject({ status: 401 });
  });
});
