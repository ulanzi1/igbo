// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Session } from "next-auth";

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { useSession } from "next-auth/react";
import { useActivePortalRole } from "./use-active-portal-role";

function mockSession(userOverrides: Record<string, unknown> = {}) {
  vi.mocked(useSession).mockReturnValue({
    data: {
      user: {
        id: "u1",
        name: "Test User",
        email: "test@example.com",
        role: "MEMBER",
        accountStatus: "active",
        profileCompleted: true,
        membershipTier: "BASIC",
        ...userOverrides,
      },
      expires: "2099-01-01",
    } as Session,
    status: "authenticated",
    update: vi.fn(),
  });
}

describe("useActivePortalRole", () => {
  it("returns JOB_SEEKER with isSeeker=true for seeker session", () => {
    mockSession({ activePortalRole: "JOB_SEEKER" });
    const { result } = renderHook(() => useActivePortalRole());
    expect(result.current.role).toBe("JOB_SEEKER");
    expect(result.current.isSeeker).toBe(true);
    expect(result.current.isEmployer).toBe(false);
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it("returns EMPLOYER with isEmployer=true for employer session", () => {
    mockSession({ activePortalRole: "EMPLOYER" });
    const { result } = renderHook(() => useActivePortalRole());
    expect(result.current.role).toBe("EMPLOYER");
    expect(result.current.isEmployer).toBe(true);
    expect(result.current.isSeeker).toBe(false);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it("returns JOB_ADMIN with isAdmin=true for admin session", () => {
    mockSession({ activePortalRole: "JOB_ADMIN" });
    const { result } = renderHook(() => useActivePortalRole());
    expect(result.current.role).toBe("JOB_ADMIN");
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.isSeeker).toBe(false);
    expect(result.current.isEmployer).toBe(false);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it("returns null role and isAuthenticated=false for unauthenticated", () => {
    vi.mocked(useSession).mockReturnValue({
      data: null,
      status: "unauthenticated",
      update: vi.fn(),
    });
    const { result } = renderHook(() => useActivePortalRole());
    expect(result.current.role).toBeNull();
    expect(result.current.isSeeker).toBe(false);
    expect(result.current.isEmployer).toBe(false);
    expect(result.current.isAuthenticated).toBe(false);
  });

  it("defaults to JOB_SEEKER when activePortalRole is not set but user is authenticated", () => {
    mockSession(); // no activePortalRole
    const { result } = renderHook(() => useActivePortalRole());
    expect(result.current.role).toBe("JOB_SEEKER");
    expect(result.current.isSeeker).toBe(true);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it("returns allRoles and hasMultipleRoles=true for multi-role user", () => {
    mockSession({
      activePortalRole: "JOB_SEEKER",
      portalRoles: ["JOB_SEEKER", "EMPLOYER"],
    });
    const { result } = renderHook(() => useActivePortalRole());
    expect(result.current.allRoles).toEqual(["JOB_SEEKER", "EMPLOYER"]);
    expect(result.current.hasMultipleRoles).toBe(true);
  });

  it("returns allRoles and hasMultipleRoles=false for single-role user", () => {
    mockSession({
      activePortalRole: "JOB_SEEKER",
      portalRoles: ["JOB_SEEKER"],
    });
    const { result } = renderHook(() => useActivePortalRole());
    expect(result.current.allRoles).toEqual(["JOB_SEEKER"]);
    expect(result.current.hasMultipleRoles).toBe(false);
  });

  it("returns all three roles for triple-role user", () => {
    mockSession({
      activePortalRole: "JOB_SEEKER",
      portalRoles: ["JOB_SEEKER", "EMPLOYER", "JOB_ADMIN"],
    });
    const { result } = renderHook(() => useActivePortalRole());
    expect(result.current.allRoles).toEqual(["JOB_SEEKER", "EMPLOYER", "JOB_ADMIN"]);
    expect(result.current.hasMultipleRoles).toBe(true);
  });

  it("returns allRoles=[] and hasMultipleRoles=false for unauthenticated", () => {
    vi.mocked(useSession).mockReturnValue({
      data: null,
      status: "unauthenticated",
      update: vi.fn(),
    });
    const { result } = renderHook(() => useActivePortalRole());
    expect(result.current.allRoles).toEqual([]);
    expect(result.current.hasMultipleRoles).toBe(false);
  });

  it("defaults allRoles to [] when portalRoles is not in session", () => {
    mockSession({ activePortalRole: "EMPLOYER" }); // no portalRoles field
    const { result } = renderHook(() => useActivePortalRole());
    expect(result.current.allRoles).toEqual([]);
    expect(result.current.hasMultipleRoles).toBe(false);
  });
});
