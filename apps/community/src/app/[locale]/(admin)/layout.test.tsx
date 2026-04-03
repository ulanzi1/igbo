// @vitest-environment node
/**
 * Admin Layout Auth Gate — Reference Test Template
 *
 * Standard cases every admin page must cover:
 *   1. Redirect to /login when unauthenticated
 *   2. Redirect to /dashboard when authenticated but not admin (MEMBER, MODERATOR)
 *   3. Allow access (render children) when admin
 *
 * Auth gate lives in the (admin) layout, not individual pages.
 * Layout under test: src/app/[locale]/(admin)/layout.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockAuth = vi.fn();
vi.mock("@igbo/auth", () => ({
  auth: () => mockAuth(),
}));

const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => {
    mockRedirect(...args);
    throw new Error("NEXT_REDIRECT");
  },
}));

vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
}));

vi.mock("@/components/layout/AdminShell", () => ({
  AdminShell: ({ children }: { children: unknown }) => children,
}));

// --- Import after mocks ---

import AdminLayout from "./layout";
import { setRequestLocale } from "next-intl/server";

// --- Helpers ---

const children = "admin-content-sentinel";

describe("Admin layout auth gate", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  // Case 1: Unauthenticated → redirect to login
  it("redirects to /login when session is null", async () => {
    mockAuth.mockResolvedValue(null);

    await expect(
      AdminLayout({ children, params: Promise.resolve({ locale: "en" }) }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/en/login");
  });

  // Case 2a: Authenticated MEMBER → redirect to dashboard
  it("redirects to /dashboard when user is MEMBER", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-1", role: "MEMBER" },
    });

    await expect(
      AdminLayout({ children, params: Promise.resolve({ locale: "en" }) }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/en/dashboard");
  });

  // Case 2b: Authenticated MODERATOR → redirect to dashboard
  it("redirects to /dashboard when user is MODERATOR", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "mod-1", role: "MODERATOR" },
    });

    await expect(
      AdminLayout({ children, params: Promise.resolve({ locale: "ig" }) }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/ig/dashboard");
  });

  // Case 3: Admin → renders children via AdminShell
  it("renders children when user is admin", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
    });

    const result = await AdminLayout({
      children,
      params: Promise.resolve({ locale: "en" }),
    });
    // AdminShell mock passes children through; layout returns JSX element wrapping children
    expect(JSON.stringify(result)).toContain(children);
  });

  // Verify setRequestLocale is called with correct locale
  it("calls setRequestLocale with the locale param", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
    });

    await AdminLayout({
      children,
      params: Promise.resolve({ locale: "ig" }),
    });
    expect(setRequestLocale).toHaveBeenCalledWith("ig");
  });
});
