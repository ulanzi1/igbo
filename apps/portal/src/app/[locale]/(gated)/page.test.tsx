// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import type { Session } from "next-auth";

vi.mock("@igbo/auth", () => ({
  auth: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-companies", () => ({
  getCompanyByOwnerId: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn().mockImplementation((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockImplementation((namespace: string) => {
    return Promise.resolve((key: string) => `${namespace}.${key}`);
  }),
  setRequestLocale: vi.fn(),
}));

import { auth } from "@igbo/auth";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
import Page from "./page";

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockGetCompany = getCompanyByOwnerId as unknown as ReturnType<typeof vi.fn>;

const completedProfile = {
  id: "cp-1",
  ownerUserId: "u2",
  name: "Acme",
  onboardingCompletedAt: new Date("2026-01-01"),
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("Portal Homepage [locale]/page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects employer without company profile to onboarding", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u2", activePortalRole: "EMPLOYER" },
      expires: "2099-01-01",
    });
    mockGetCompany.mockResolvedValue(null);

    await expect(Page({ params: Promise.resolve({ locale: "en" }) })).rejects.toThrow(
      "REDIRECT:/en/onboarding",
    );
  });

  it("redirects employer with incomplete onboarding to onboarding", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u2", activePortalRole: "EMPLOYER" },
      expires: "2099-01-01",
    });
    mockGetCompany.mockResolvedValue({ ...completedProfile, onboardingCompletedAt: null });

    await expect(Page({ params: Promise.resolve({ locale: "en" }) })).rejects.toThrow(
      "REDIRECT:/en/onboarding",
    );
  });

  it("shows employer welcome message for employer with completed onboarding", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u2", activePortalRole: "EMPLOYER" } as Session["user"],
      expires: "2099-01-01",
    } as Session);
    mockGetCompany.mockResolvedValue(completedProfile);

    const jsx = await Page({ params: Promise.resolve({ locale: "en" }) });
    const { getByText } = render(jsx as React.ReactElement);
    expect(getByText(/employerWelcome/i)).toBeInTheDocument();
  });

  it("shows seeker welcome message for authenticated seeker (no company check)", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u1", activePortalRole: "JOB_SEEKER" } as Session["user"],
      expires: "2099-01-01",
    } as Session);

    const jsx = await Page({ params: Promise.resolve({ locale: "en" }) });
    const { getByText } = render(jsx as React.ReactElement);
    expect(getByText(/seekerWelcome/i)).toBeInTheDocument();
    // Seeker role should not trigger company profile lookup
    expect(mockGetCompany).not.toHaveBeenCalledWith("u1");
  });

  it("shows guest welcome with login/join CTAs when auth returns null", async () => {
    mockAuth.mockResolvedValue(null);

    const jsx = await Page({ params: Promise.resolve({ locale: "en" }) });
    const { getByText } = render(jsx as React.ReactElement);
    expect(getByText(/guestWelcome/i)).toBeInTheDocument();
    // Login link text and join now link text
    expect(getByText("Portal.nav.login")).toBeInTheDocument();
    expect(getByText(/joinNow/i)).toBeInTheDocument();
  });

  it("guest login CTA has returnTo pointing to portal URL (not empty)", async () => {
    process.env.COMMUNITY_URL = "http://localhost:3000";
    process.env.NEXTAUTH_URL = "http://localhost:3001";
    mockAuth.mockResolvedValue(null);

    const jsx = await Page({ params: Promise.resolve({ locale: "en" }) });
    const { container } = render(jsx as React.ReactElement);
    const loginLink = container.querySelector("a[href*='/login']");
    expect(loginLink).toBeTruthy();
    const href = loginLink!.getAttribute("href")!;
    expect(href).toContain("returnTo=");
    // returnTo should include portal URL, not be empty
    const returnTo = decodeURIComponent(href.split("returnTo=")[1]!);
    expect(returnTo).toContain("http://localhost:3001/en");
  });
});
