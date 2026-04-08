// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-seeker-profiles", () => ({
  getSeekerProfileByUserId: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-seeker-preferences", () => ({
  getSeekerPreferencesByProfileId: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-seeker-cvs", () => ({
  listSeekerCvs: vi.fn(),
}));
vi.mock("@igbo/db/queries/cross-app", () => ({
  getCommunityProfileForPrefill: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn().mockImplementation((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
}));
vi.mock("@/components/flow/seeker-onboarding-flow", () => ({
  SeekerOnboardingFlow: (props: Record<string, unknown>) => (
    <div
      data-testid="seeker-onboarding-flow"
      data-step={props.initialStep}
      data-has-profile={props.seekerProfile ? "true" : "false"}
      data-has-prefill={props.prefill ? "true" : "false"}
      data-has-prefs={props.initialPreferences ? "true" : "false"}
      data-cvs-count={Array.isArray(props.initialCvs) ? (props.initialCvs as unknown[]).length : 0}
    />
  ),
}));

import { auth } from "@igbo/auth";
import { getSeekerProfileByUserId } from "@igbo/db/queries/portal-seeker-profiles";
import { getSeekerPreferencesByProfileId } from "@igbo/db/queries/portal-seeker-preferences";
import { listSeekerCvs } from "@igbo/db/queries/portal-seeker-cvs";
import { getCommunityProfileForPrefill } from "@igbo/db/queries/cross-app";
import SeekerOnboardingPage from "./page";

const seekerSession = {
  user: { id: "user-123", activePortalRole: "JOB_SEEKER" },
  expires: "2099-01-01",
};

const mockProfile = {
  id: "seeker-uuid",
  userId: "user-123",
  headline: "Senior Engineer",
  summary: null,
  skills: [],
  experienceJson: [],
  educationJson: [],
  visibility: "passive",
  consentMatching: false,
  consentEmployerView: false,
  consentMatchingChangedAt: null,
  consentEmployerViewChangedAt: null,
  onboardingCompletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSeekerPreferencesByProfileId).mockResolvedValue(null);
  vi.mocked(listSeekerCvs).mockResolvedValue([]);
  vi.mocked(getCommunityProfileForPrefill).mockResolvedValue({ displayName: null, bio: null });
});

describe("SeekerOnboardingPage", () => {
  it("renders Step 1 when no profile exists (initialStep=1)", async () => {
    vi.mocked(auth).mockResolvedValue(
      seekerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    );
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(null);

    const jsx = await SeekerOnboardingPage({ params: Promise.resolve({ locale: "en" }) });
    const { getByTestId } = render(jsx as React.ReactElement);
    expect(getByTestId("seeker-onboarding-flow").getAttribute("data-step")).toBe("1");
    expect(getByTestId("seeker-onboarding-flow").getAttribute("data-has-profile")).toBe("false");
  });

  it("renders Step 2 when profile exists but onboardingCompletedAt is null (initialStep=2)", async () => {
    vi.mocked(auth).mockResolvedValue(
      seekerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    );
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);

    const jsx = await SeekerOnboardingPage({ params: Promise.resolve({ locale: "en" }) });
    const { getByTestId } = render(jsx as React.ReactElement);
    expect(getByTestId("seeker-onboarding-flow").getAttribute("data-step")).toBe("2");
    expect(getByTestId("seeker-onboarding-flow").getAttribute("data-has-profile")).toBe("true");
  });

  it("redirects to home when onboarding is already completed", async () => {
    vi.mocked(auth).mockResolvedValue(
      seekerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    );
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue({
      ...mockProfile,
      onboardingCompletedAt: new Date("2026-04-01"),
    });

    await expect(
      SeekerOnboardingPage({ params: Promise.resolve({ locale: "en" }) }),
    ).rejects.toThrow("REDIRECT:/en");
  });

  it("redirects non-seeker (EMPLOYER) to home", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-456", activePortalRole: "EMPLOYER" },
      expires: "2099-01-01",
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);

    await expect(
      SeekerOnboardingPage({ params: Promise.resolve({ locale: "en" }) }),
    ).rejects.toThrow("REDIRECT:/en");
  });

  it("passes community pre-fill data to flow component for Step 1", async () => {
    vi.mocked(auth).mockResolvedValue(
      seekerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    );
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(null);
    vi.mocked(getCommunityProfileForPrefill).mockResolvedValue({
      displayName: "Chidi Okeke",
      bio: "Software engineer",
    });

    const jsx = await SeekerOnboardingPage({ params: Promise.resolve({ locale: "en" }) });
    const { getByTestId } = render(jsx as React.ReactElement);
    expect(getByTestId("seeker-onboarding-flow").getAttribute("data-has-prefill")).toBe("true");
    expect(getByTestId("seeker-onboarding-flow").getAttribute("data-step")).toBe("1");
  });

  it("passes preferences and CVs to flow component for Step 2", async () => {
    vi.mocked(auth).mockResolvedValue(
      seekerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    );
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    vi.mocked(getSeekerPreferencesByProfileId).mockResolvedValue({
      id: "pref-uuid",
      seekerProfileId: "seeker-uuid",
      desiredRoles: ["engineer"],
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: "NGN",
      locations: [],
      workModes: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(listSeekerCvs).mockResolvedValue([
      {
        id: "cv-uuid",
        seekerProfileId: "seeker-uuid",
        fileUploadId: "file-uuid",
        label: "My CV",
        isDefault: true,
        createdAt: new Date(),
        file: {
          originalFilename: "cv.pdf",
          fileType: "application/pdf",
          fileSize: 1024,
          objectKey: "portal/cvs/user-123/cv.pdf",
          status: "ready" as const,
        },
      },
    ]);

    const jsx = await SeekerOnboardingPage({ params: Promise.resolve({ locale: "en" }) });
    const { getByTestId } = render(jsx as React.ReactElement);
    expect(getByTestId("seeker-onboarding-flow").getAttribute("data-has-prefs")).toBe("true");
    expect(getByTestId("seeker-onboarding-flow").getAttribute("data-cvs-count")).toBe("1");
  });

  it("redirects unauthenticated user to home", async () => {
    vi.mocked(auth).mockResolvedValue(
      null as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    );

    await expect(
      SeekerOnboardingPage({ params: Promise.resolve({ locale: "en" }) }),
    ).rejects.toThrow("REDIRECT:/en");
  });
});
