// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { renderWithPortalProviders } from "@/test-utils/render";
import { OnboardingFlow } from "./onboarding-flow";

expect.extend(toHaveNoViolations);

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/components/flow/company-profile-form", () => ({
  CompanyProfileForm: ({ onSuccess }: { mode: string; onSuccess?: (profile: unknown) => void }) => (
    <button
      data-testid="submit-profile"
      onClick={() =>
        onSuccess?.({
          id: "new-company",
          name: "Test Corp",
          ownerUserId: "u1",
          onboardingCompletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      }
    >
      Submit Profile
    </button>
  ),
}));

const mockProfile = {
  id: "existing-company",
  ownerUserId: "u1",
  name: "Existing Corp",
  logoUrl: null,
  description: null,
  industry: null,
  companySize: null,
  cultureInfo: null,
  trustBadge: false,
  onboardingCompletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OnboardingFlow — Step 1", () => {
  it("renders step indicator at step 1", () => {
    renderWithPortalProviders(<OnboardingFlow initialStep={1} locale="en" />);
    // Step indicator should be present (nav element)
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });

  it("step 1 shows company profile form", () => {
    renderWithPortalProviders(<OnboardingFlow initialStep={1} locale="en" />);
    expect(screen.getByTestId("submit-profile")).toBeInTheDocument();
  });

  it("completing step 1 sets createdProfile and advances to step 2", async () => {
    renderWithPortalProviders(<OnboardingFlow initialStep={1} locale="en" />);
    const submitBtn = screen.getByTestId("submit-profile");
    act(() => {
      submitBtn.click();
    });
    await waitFor(() => {
      // Should now be on step 2 — create job posting link visible
      expect(screen.getByRole("link", { name: /create job posting/i })).toBeInTheDocument();
    });
  });
});

describe("OnboardingFlow — Step 2", () => {
  it("shows create job posting link with correct href including ?from=onboarding", () => {
    renderWithPortalProviders(<OnboardingFlow initialStep={2} locale="en" />);
    const link = screen.getByRole("link", { name: /create job posting/i });
    expect(link.getAttribute("href")).toBe("/en/jobs/new?from=onboarding");
  });

  it("shows skip for now button", () => {
    renderWithPortalProviders(<OnboardingFlow initialStep={2} locale="en" />);
    expect(screen.getByRole("button", { name: /skip for now/i })).toBeInTheDocument();
  });

  it("skip advances to step 3", async () => {
    renderWithPortalProviders(<OnboardingFlow initialStep={2} locale="en" />);
    const skipBtn = screen.getByRole("button", { name: /skip for now/i });
    act(() => {
      skipBtn.click();
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /go to dashboard/i })).toBeInTheDocument();
    });
  });
});

describe("OnboardingFlow — Step 3", () => {
  it("shows completion summary with profile name when createdProfile is set", () => {
    renderWithPortalProviders(
      <OnboardingFlow initialStep={2} companyProfile={mockProfile} locale="en" />,
    );
    // Skip to step 3
    act(() => {
      screen.getByRole("button", { name: /skip for now/i }).click();
    });
    // The profile name should appear in the summary
    expect(screen.getByText(/existing corp/i)).toBeInTheDocument();
  });

  it("shows complete/go-to-dashboard button", async () => {
    renderWithPortalProviders(
      <OnboardingFlow initialStep={3} companyProfile={mockProfile} locale="en" />,
    );
    expect(screen.getByRole("button", { name: /go to dashboard/i })).toBeInTheDocument();
  });

  it("complete button calls POST /api/v1/onboarding/complete then redirects", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { success: true } }),
    });

    renderWithPortalProviders(
      <OnboardingFlow initialStep={3} companyProfile={mockProfile} locale="en" />,
    );

    await userEvent.click(screen.getByRole("button", { name: /go to dashboard/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/v1/onboarding/complete",
        expect.objectContaining({ method: "POST" }),
      );
      expect(mockPush).toHaveBeenCalledWith("/en");
    });
  });

  it("shows error toast when complete API call fails", async () => {
    const { toast } = await import("sonner");
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ detail: "Failed" }),
    });

    renderWithPortalProviders(
      <OnboardingFlow initialStep={3} companyProfile={mockProfile} locale="en" />,
    );

    await userEvent.click(screen.getByRole("button", { name: /go to dashboard/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed");
    });
  });
});

describe("OnboardingFlow — accessibility", () => {
  it("passes axe-core check on step 1", async () => {
    const { container } = renderWithPortalProviders(<OnboardingFlow initialStep={1} locale="en" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("passes axe-core check on step 2", async () => {
    const { container } = renderWithPortalProviders(<OnboardingFlow initialStep={2} locale="en" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
