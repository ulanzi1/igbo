// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render } from "@testing-library/react";

vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-companies", () => ({
  getCompanyByOwnerId: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn().mockImplementation((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
}));
vi.mock("@/components/flow/onboarding-flow", () => ({
  OnboardingFlow: ({
    initialStep,
    companyProfile,
    locale,
  }: {
    initialStep: number;
    companyProfile?: unknown;
    locale: string;
  }) => (
    <div data-testid="onboarding-flow" data-step={initialStep} data-locale={locale}>
      {companyProfile ? "has-profile" : "no-profile"}
    </div>
  ),
}));

import { auth } from "@igbo/auth";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
import OnboardingPage from "./page";

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockGetCompany = getCompanyByOwnerId as unknown as ReturnType<typeof vi.fn>;

const employerSession = {
  user: { id: "user-123", activePortalRole: "EMPLOYER" },
  expires: "2099-01-01",
};

const mockProfile = {
  id: "company-uuid",
  ownerUserId: "user-123",
  name: "Acme Corp",
  onboardingCompletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("OnboardingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects non-employer (seeker) to locale root", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u1", activePortalRole: "JOB_SEEKER" },
    });

    await expect(OnboardingPage({ params: Promise.resolve({ locale: "en" }) })).rejects.toThrow(
      "REDIRECT:/en",
    );
  });

  it("redirects unauthenticated user to locale root", async () => {
    mockAuth.mockResolvedValue(null);

    await expect(OnboardingPage({ params: Promise.resolve({ locale: "en" }) })).rejects.toThrow(
      "REDIRECT:/en",
    );
  });

  it("redirects already-onboarded employer to locale root", async () => {
    mockAuth.mockResolvedValue(employerSession);
    mockGetCompany.mockResolvedValue({
      ...mockProfile,
      onboardingCompletedAt: new Date("2026-04-01"),
    });

    await expect(OnboardingPage({ params: Promise.resolve({ locale: "en" }) })).rejects.toThrow(
      "REDIRECT:/en",
    );
  });

  it("starts at step 1 for employer without company profile", async () => {
    mockAuth.mockResolvedValue(employerSession);
    mockGetCompany.mockResolvedValue(null);

    const jsx = await OnboardingPage({ params: Promise.resolve({ locale: "en" }) });
    const { getByTestId } = render(jsx as React.ReactElement);
    expect(getByTestId("onboarding-flow").getAttribute("data-step")).toBe("1");
    expect(getByTestId("onboarding-flow").textContent).toContain("no-profile");
  });

  it("starts at step 2 for employer with profile but no onboarding completion", async () => {
    mockAuth.mockResolvedValue(employerSession);
    mockGetCompany.mockResolvedValue(mockProfile);

    const jsx = await OnboardingPage({ params: Promise.resolve({ locale: "en" }) });
    const { getByTestId } = render(jsx as React.ReactElement);
    expect(getByTestId("onboarding-flow").getAttribute("data-step")).toBe("2");
    expect(getByTestId("onboarding-flow").textContent).toContain("has-profile");
  });

  it("renders OnboardingFlow with correct locale prop", async () => {
    mockAuth.mockResolvedValue(employerSession);
    mockGetCompany.mockResolvedValue(null);

    const jsx = await OnboardingPage({ params: Promise.resolve({ locale: "ig" }) });
    const { getByTestId } = render(jsx as React.ReactElement);
    expect(getByTestId("onboarding-flow").getAttribute("data-locale")).toBe("ig");
  });
});
