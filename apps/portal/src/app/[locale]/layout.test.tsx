// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render } from "@testing-library/react";

vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("next-intl", () => ({
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  hasLocale: (_locales: string[], _locale: string) => true,
}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
}));
vi.mock("@/i18n/routing", () => ({
  routing: { locales: ["en", "ig"] },
}));
vi.mock("@/components/layout/skip-link", () => ({
  SkipLink: () => null,
}));
vi.mock("@/components/ui/sonner", () => ({
  Toaster: () => null,
}));
vi.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSession: () => ({ status: "unauthenticated", data: null }),
}));
vi.mock("@/providers/SocketProvider", () => ({
  SocketProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Capture DensityProvider props for assertion
let capturedDefaultDensity: string | undefined;
vi.mock("@/providers/density-context", () => ({
  DensityProvider: ({
    children,
    defaultDensity,
  }: {
    children: React.ReactNode;
    defaultDensity: string;
  }) => {
    capturedDefaultDensity = defaultDensity;
    return <>{children}</>;
  },
  ROLE_DENSITY_DEFAULTS: {
    JOB_SEEKER: "comfortable",
    EMPLOYER: "compact",
    JOB_ADMIN: "dense",
  },
}));

import { auth } from "@igbo/auth";
import LocaleLayout from "./layout";

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;

describe("LocaleLayout — DensityProvider integration", () => {
  it("passes compact defaultDensity for EMPLOYER role", async () => {
    capturedDefaultDensity = undefined;
    mockAuth.mockResolvedValue({
      user: { id: "u1", activePortalRole: "EMPLOYER" },
      expires: "2099-01-01",
    });

    const jsx = await LocaleLayout({
      children: <span>child</span>,
      params: Promise.resolve({ locale: "en" }),
    });
    render(jsx as React.ReactElement);
    expect(capturedDefaultDensity).toBe("compact");
  });

  it("passes comfortable defaultDensity for JOB_SEEKER role", async () => {
    capturedDefaultDensity = undefined;
    mockAuth.mockResolvedValue({
      user: { id: "u2", activePortalRole: "JOB_SEEKER" },
      expires: "2099-01-01",
    });

    const jsx = await LocaleLayout({
      children: <span>child</span>,
      params: Promise.resolve({ locale: "en" }),
    });
    render(jsx as React.ReactElement);
    expect(capturedDefaultDensity).toBe("comfortable");
  });

  it("passes comfortable defaultDensity for unauthenticated (null session)", async () => {
    capturedDefaultDensity = undefined;
    mockAuth.mockResolvedValue(null);

    const jsx = await LocaleLayout({
      children: <span>child</span>,
      params: Promise.resolve({ locale: "en" }),
    });
    render(jsx as React.ReactElement);
    expect(capturedDefaultDensity).toBe("comfortable");
  });
});
