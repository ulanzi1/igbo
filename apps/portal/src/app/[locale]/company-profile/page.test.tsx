import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-companies", () => ({
  getCompanyByOwnerId: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));
vi.mock("@/components/flow/company-profile-form", () => ({
  CompanyProfileForm: ({
    mode,
    showOnboardingToast,
  }: {
    mode: string;
    showOnboardingToast?: boolean;
  }) => (
    <div
      data-testid="company-profile-form"
      data-mode={mode}
      data-onboarding={String(!!showOnboardingToast)}
    />
  ),
  CompanyProfileFormSkeleton: () => <div>Skeleton</div>,
}));
vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: { children: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import React from "react";
import { render, screen } from "@testing-library/react";
import { auth } from "@igbo/auth";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
import Page from "./page";

const employerSession = {
  user: { id: "user-123", activePortalRole: "EMPLOYER" },
};

const mockProfile = {
  id: "company-uuid",
  ownerUserId: "user-123",
  name: "Acme Corp",
  logoUrl: null,
  description: null,
  industry: null,
  companySize: null,
  cultureInfo: null,
  trustBadge: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(
    employerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
  );
});

async function renderPage(searchParamsOverride?: Record<string, string>) {
  const node = await Page({
    params: Promise.resolve({ locale: "en" }),
    searchParams: Promise.resolve(searchParamsOverride ?? {}),
  });
  return render(node as React.ReactElement);
}

describe("CompanyProfilePage", () => {
  it("renders create form when no profile exists", async () => {
    vi.mocked(getCompanyByOwnerId).mockResolvedValue(null);
    await renderPage();
    expect(screen.getByTestId("company-profile-form")).toBeTruthy();
    expect(screen.getByTestId("company-profile-form").getAttribute("data-mode")).toBe("create");
  });

  it("renders profile view when profile exists", async () => {
    vi.mocked(getCompanyByOwnerId).mockResolvedValue(mockProfile);
    await renderPage();
    expect(screen.getByText("Acme Corp")).toBeTruthy();
    expect(screen.queryByTestId("company-profile-form")).toBeNull();
  });

  it("renders edit form when ?edit=true param is present", async () => {
    vi.mocked(getCompanyByOwnerId).mockResolvedValue(mockProfile);
    await renderPage({ edit: "true" });
    expect(screen.getByTestId("company-profile-form")).toBeTruthy();
    expect(screen.getByTestId("company-profile-form").getAttribute("data-mode")).toBe("edit");
  });

  it("passes showOnboardingToast when onboarding=true param is present", async () => {
    vi.mocked(getCompanyByOwnerId).mockResolvedValue(null);
    await renderPage({ onboarding: "true" });
    const form = screen.getByTestId("company-profile-form");
    expect(form.getAttribute("data-onboarding")).toBe("true");
  });

  it("does not pass showOnboardingToast without onboarding param", async () => {
    vi.mocked(getCompanyByOwnerId).mockResolvedValue(null);
    await renderPage();
    const form = screen.getByTestId("company-profile-form");
    expect(form.getAttribute("data-onboarding")).toBe("false");
  });

  it("redirects non-employer to home", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-456", activePortalRole: "JOB_SEEKER" },
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);

    await expect(renderPage()).rejects.toThrow("REDIRECT:/en");
  });

  it("redirects unauthenticated to home", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    await expect(renderPage()).rejects.toThrow("REDIRECT:/en");
  });
});
