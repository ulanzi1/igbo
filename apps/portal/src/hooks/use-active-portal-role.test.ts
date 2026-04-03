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

function mockSession(overrides: Partial<Session> & { user?: Record<string, unknown> } = {}) {
  vi.mocked(useSession).mockReturnValue({
    data: {
      user: { id: "u1", name: "Test User", email: "test@example.com", ...overrides.user },
      expires: "2099-01-01",
    } as Session,
    status: "authenticated",
    update: vi.fn(),
  });
}

describe("useActivePortalRole", () => {
  it("returns JOB_SEEKER with isSeeker=true for seeker session", () => {
    mockSession({ user: { activePortalRole: "JOB_SEEKER" } });
    const { result } = renderHook(() => useActivePortalRole());
    expect(result.current.role).toBe("JOB_SEEKER");
    expect(result.current.isSeeker).toBe(true);
    expect(result.current.isEmployer).toBe(false);
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it("returns EMPLOYER with isEmployer=true for employer session", () => {
    mockSession({ user: { activePortalRole: "EMPLOYER" } });
    const { result } = renderHook(() => useActivePortalRole());
    expect(result.current.role).toBe("EMPLOYER");
    expect(result.current.isEmployer).toBe(true);
    expect(result.current.isSeeker).toBe(false);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it("returns JOB_ADMIN with isAdmin=true for admin session", () => {
    mockSession({ user: { activePortalRole: "JOB_ADMIN" } });
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
    mockSession({ user: {} }); // no activePortalRole
    const { result } = renderHook(() => useActivePortalRole());
    expect(result.current.role).toBe("JOB_SEEKER");
    expect(result.current.isSeeker).toBe(true);
    expect(result.current.isAuthenticated).toBe(true);
  });
});
