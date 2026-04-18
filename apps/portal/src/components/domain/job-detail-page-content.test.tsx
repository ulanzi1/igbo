import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist mocks before imports
const mockUseTranslations = vi.hoisted(() =>
  vi.fn((ns: string) => {
    return (key: string, params?: Record<string, unknown>) => {
      const fullKey = `${ns}.${key}`;
      if (params) {
        return Object.entries(params).reduce(
          (s, [k, v]) => s.replace(`{${k}}`, String(v)),
          fullKey,
        );
      }
      return fullKey;
    };
  }),
);

const mockUseLocale = vi.hoisted(() => vi.fn(() => "en"));

vi.mock("next-intl", () => ({
  useTranslations: mockUseTranslations,
  useLocale: mockUseLocale,
}));

const searchParamsRef = { current: new URLSearchParams() };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/en/jobs/posting-uuid",
  useSearchParams: () => searchParamsRef.current,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/domain/apply-button", () => ({
  ApplyButton: (props: { jobId: string; hasExistingApplication: boolean; autoApply?: boolean }) => (
    <div
      data-testid="apply-button"
      data-job-id={props.jobId}
      data-has-existing={String(props.hasExistingApplication)}
      data-auto-apply={String(props.autoApply ?? false)}
    />
  ),
}));

vi.mock("@/components/domain/view-tracker", () => ({
  ViewTracker: ({ jobId }: { jobId: string }) => (
    <div data-testid="view-tracker" data-job-id={jobId} />
  ),
}));

vi.mock("@/components/domain/trust-badge", () => ({
  TrustBadge: () => <div data-testid="trust-badge" />,
}));

vi.mock("@/components/domain/report-posting-button", () => ({
  ReportPostingButton: ({ postingId }: { postingId: string }) => (
    <button data-testid="report-button" data-posting-id={postingId} />
  ),
}));

vi.mock("@/components/semantic/cultural-context-badges", () => ({
  CulturalContextBadges: () => <div data-testid="cultural-context-badges" />,
}));

vi.mock("@/components/semantic/salary-display", () => ({
  SalaryDisplay: () => <span data-testid="salary-display" />,
}));

vi.mock("@/components/domain/similar-jobs-section", () => ({
  SimilarJobsSection: ({ jobId, isSeeker }: { jobId: string; isSeeker: boolean }) => (
    <div data-testid="similar-jobs-section" data-job-id={jobId} data-is-seeker={String(isSeeker)} />
  ),
}));

vi.mock("@/components/domain/guest-conversion-banner", () => ({
  GuestConversionBanner: ({
    communityUrl,
    callbackUrl,
  }: {
    communityUrl: string;
    callbackUrl: string;
  }) => (
    <div
      data-testid="guest-conversion-banner"
      data-community-url={communityUrl}
      data-callback-url={callbackUrl}
    />
  ),
}));

// Radix pointer polyfills for jsdom
Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  setPointerCapture: () => undefined,
  releasePointerCapture: () => undefined,
  scrollIntoView: () => undefined,
});

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { JobDetailPageContent, type JobDetailPageContentProps } from "./job-detail-page-content";

expect.extend(toHaveNoViolations);

const FIXED_DATE = new Date("2026-01-01T00:00:00.000Z");

function makeProps(overrides: Partial<JobDetailPageContentProps> = {}): JobDetailPageContentProps {
  return {
    jobId: "posting-uuid",
    locale: "en",
    posting: {
      id: "posting-uuid",
      title: "Senior Engineer",
      descriptionHtml: "<p>Great role description</p>",
      descriptionIgboHtml: null,
      requirements: "<p>Requirements here</p>",
      location: "Lagos",
      employmentType: "full_time",
      salaryMin: null,
      salaryMax: null,
      salaryCompetitiveOnly: false,
      applicationDeadline: null,
      culturalContextJson: null,
      enableCoverLetter: false,
      createdAt: FIXED_DATE.toISOString(),
    },
    company: {
      id: "company-uuid",
      name: "Acme Corp",
      logoUrl: null,
      description: "A great company",
      industry: "technology",
      companySize: "51-200",
      cultureInfo: "We value teamwork",
      trustBadge: false,
    },
    isGuest: false,
    isSeeker: false,
    isEmployerOrAdmin: false,
    canReport: false,
    isExpiredOrFilled: false,
    isFilled: false,
    seekerProfile: null,
    hasExistingApplication: false,
    applicationDate: null,
    profileLocation: null,
    deadlinePassed: false,
    employmentTypeLabel: "Full-time",
    remoteLabel: "Remote",
    communityUrl: "https://community.example.com",
    ...overrides,
  };
}

describe("JobDetailPageContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLocale.mockReturnValue("en");
    searchParamsRef.current = new URLSearchParams();
  });

  describe("header section", () => {
    it("renders job title as h1", () => {
      render(<JobDetailPageContent {...makeProps()} />);
      expect(screen.getByRole("heading", { level: 1, name: "Senior Engineer" })).toBeTruthy();
    });

    it("renders company name linked to company page", () => {
      render(<JobDetailPageContent {...makeProps()} />);
      const link = screen.getByRole("link", { name: "Acme Corp" });
      expect(link.getAttribute("href")).toContain("/companies/company-uuid");
    });

    it("renders TrustBadge when trustBadge is true", () => {
      render(
        <JobDetailPageContent
          {...makeProps({ company: { ...makeProps().company, trustBadge: true } })}
        />,
      );
      expect(screen.getByTestId("trust-badge")).toBeTruthy();
    });

    it("does not render TrustBadge when trustBadge is false", () => {
      render(<JobDetailPageContent {...makeProps()} />);
      expect(screen.queryByTestId("trust-badge")).toBeNull();
    });

    it("renders ReportPostingButton when canReport is true", () => {
      render(<JobDetailPageContent {...makeProps({ canReport: true })} />);
      const btn = screen.getByTestId("report-button");
      expect(btn.getAttribute("data-posting-id")).toBe("posting-uuid");
    });

    it("does not render ReportPostingButton when canReport is false", () => {
      render(<JobDetailPageContent {...makeProps({ canReport: false })} />);
      expect(screen.queryByTestId("report-button")).toBeNull();
    });

    it("renders company logo fallback with first letter when no logoUrl", () => {
      render(<JobDetailPageContent {...makeProps()} />);
      expect(screen.getByText("A")).toBeTruthy(); // "Acme Corp"[0]
    });

    it("renders employment type label", () => {
      render(<JobDetailPageContent {...makeProps()} />);
      expect(screen.getByText("Full-time")).toBeTruthy();
    });

    it("shows location", () => {
      render(<JobDetailPageContent {...makeProps()} />);
      expect(screen.getByText("Lagos")).toBeTruthy();
    });

    it("shows remote label when location is null", () => {
      render(
        <JobDetailPageContent
          {...makeProps({
            posting: { ...makeProps().posting, location: null },
          })}
        />,
      );
      expect(screen.getByText("Remote")).toBeTruthy();
    });

    it("renders ViewTracker with correct jobId", () => {
      render(<JobDetailPageContent {...makeProps()} />);
      const tracker = screen.getByTestId("view-tracker");
      expect(tracker.getAttribute("data-job-id")).toBe("posting-uuid");
    });

    it("renders cultural context badges when present", () => {
      render(
        <JobDetailPageContent
          {...makeProps({
            posting: {
              ...makeProps().posting,
              culturalContextJson: {
                diasporaFriendly: true,
                igboLanguagePreferred: false,
                communityReferred: false,
              },
            },
          })}
        />,
      );
      expect(screen.getByTestId("cultural-context-badges")).toBeTruthy();
    });

    it("shows applied-on date when seeker has existing application", () => {
      render(
        <JobDetailPageContent
          {...makeProps({
            isSeeker: true,
            hasExistingApplication: true,
            applicationDate: "2026-03-15T00:00:00.000Z",
          })}
        />,
      );
      // The date appears as "Applied on {date}" (i18n mock returns Portal.jobDetail.appliedOn {date})
      expect(screen.getAllByText(/appliedOn/i).length).toBeGreaterThan(0);
    });
  });

  describe("tabs", () => {
    it("renders all three tab triggers", () => {
      render(<JobDetailPageContent {...makeProps()} />);
      // Use getByRole("tab") to target tab triggers specifically (avoids matching h2 heading with same key)
      expect(screen.getByRole("tab", { name: "Portal.jobDetail.descriptionTab" })).toBeTruthy();
      expect(screen.getByRole("tab", { name: "Portal.jobDetail.companyInfoTab" })).toBeTruthy();
      expect(screen.getByRole("tab", { name: "Portal.jobDetail.similarJobsTab" })).toBeTruthy();
    });

    it("description tab is default: shows job description", () => {
      render(<JobDetailPageContent {...makeProps()} />);
      // dangerouslySetInnerHTML renders the raw HTML
      const desc = document.querySelector(".prose");
      expect(desc).toBeTruthy();
    });

    it("description tab shows requirements section heading", () => {
      render(<JobDetailPageContent {...makeProps()} />);
      // The requirements section heading uses the i18n key
      expect(screen.getByText("Portal.jobDetail.requirements")).toBeTruthy();
    });

    it("company info tab shows company description after switching", async () => {
      const user = userEvent.setup();
      render(<JobDetailPageContent {...makeProps()} />);
      await user.click(screen.getByText("Portal.jobDetail.companyInfoTab"));
      expect(screen.getByText("A great company")).toBeTruthy();
    });

    it("company info tab shows industry label", async () => {
      const user = userEvent.setup();
      render(<JobDetailPageContent {...makeProps()} />);
      await user.click(screen.getByText("Portal.jobDetail.companyInfoTab"));
      // isKnownIndustry("technology") → tIndustries("technology") → "Portal.industries.technology"
      expect(screen.getByText("Portal.industries.technology")).toBeTruthy();
    });

    it("company info tab shows company size", async () => {
      const user = userEvent.setup();
      render(<JobDetailPageContent {...makeProps()} />);
      await user.click(screen.getByText("Portal.jobDetail.companyInfoTab"));
      expect(screen.getByText("51-200")).toBeTruthy();
    });

    it("renders Igbo description when locale is ig and descriptionIgboHtml is present", () => {
      mockUseLocale.mockReturnValue("ig");
      const { container } = render(
        <JobDetailPageContent
          {...makeProps({
            locale: "ig",
            posting: {
              ...makeProps().posting,
              descriptionHtml: "<p>English description</p>",
              descriptionIgboHtml: "<p>Nkọwa Igbo</p>",
            },
          })}
        />,
      );
      expect(container.innerHTML).toContain("Nkọwa Igbo");
      expect(container.innerHTML).not.toContain("English description");
    });

    it("falls back to English description when locale is ig but no Igbo content", () => {
      mockUseLocale.mockReturnValue("ig");
      const { container } = render(
        <JobDetailPageContent
          {...makeProps({
            locale: "ig",
            posting: {
              ...makeProps().posting,
              descriptionHtml: "<p>English description</p>",
              descriptionIgboHtml: null,
            },
          })}
        />,
      );
      expect(container.innerHTML).toContain("English description");
    });

    it("similar jobs tab renders SimilarJobsSection", async () => {
      const user = userEvent.setup();
      render(<JobDetailPageContent {...makeProps()} />);
      await user.click(screen.getByText("Portal.jobDetail.similarJobsTab"));
      expect(screen.getByTestId("similar-jobs-section")).toBeTruthy();
    });

    it("SimilarJobsSection receives isSeeker=true for seekers", async () => {
      const user = userEvent.setup();
      render(<JobDetailPageContent {...makeProps({ isSeeker: true, isGuest: false })} />);
      await user.click(screen.getByText("Portal.jobDetail.similarJobsTab"));
      const section = screen.getByTestId("similar-jobs-section");
      expect(section.getAttribute("data-is-seeker")).toBe("true");
    });

    it("SimilarJobsSection receives isSeeker=false for guests", async () => {
      const user = userEvent.setup();
      render(<JobDetailPageContent {...makeProps({ isSeeker: false, isGuest: true })} />);
      await user.click(screen.getByText("Portal.jobDetail.similarJobsTab"));
      const section = screen.getByTestId("similar-jobs-section");
      expect(section.getAttribute("data-is-seeker")).toBe("false");
    });
  });

  describe("status banners", () => {
    it("renders expired banner with search link", () => {
      render(<JobDetailPageContent {...makeProps({ isExpiredOrFilled: true, isFilled: false })} />);
      expect(screen.getByText("Portal.jobDetail.expiredBanner")).toBeTruthy();
      expect(screen.getByText("Portal.jobDetail.expiredSearchLink")).toBeTruthy();
      const link = screen.getByRole("link", { name: "Portal.jobDetail.expiredSearchLink" });
      expect(link.getAttribute("href")).toContain("/search?q=");
      // encodeURIComponent uses %20 for spaces
      expect(link.getAttribute("href")).toContain("Senior%20Engineer");
    });

    it("renders filled banner with browse link", () => {
      render(<JobDetailPageContent {...makeProps({ isExpiredOrFilled: true, isFilled: true })} />);
      expect(screen.getByText("Portal.jobDetail.filledBanner")).toBeTruthy();
      expect(screen.getByText("Portal.jobDetail.filledBrowseLink")).toBeTruthy();
      const link = screen.getByRole("link", { name: "Portal.jobDetail.filledBrowseLink" });
      expect(link.getAttribute("href")).toContain("/jobs");
    });

    it("banner has role=alert", () => {
      render(<JobDetailPageContent {...makeProps({ isExpiredOrFilled: true, isFilled: false })} />);
      expect(screen.getByRole("alert")).toBeTruthy();
    });
  });

  describe("sticky CTA bar", () => {
    it("shows 'Sign In to Apply' for guest", () => {
      render(<JobDetailPageContent {...makeProps({ isGuest: true })} />);
      const links = screen.getAllByText("Portal.jobDetail.signInToApply");
      expect(links.length).toBeGreaterThan(0); // appears in mobile + desktop bars
    });

    it("'Sign In to Apply' links to community /login (not /auth/signin) with communityUrl", () => {
      render(<JobDetailPageContent {...makeProps({ isGuest: true })} />);
      const links = screen.getAllByRole("link", { name: "Portal.jobDetail.signInToApply" });
      expect(links.length).toBeGreaterThan(0);
      // Each link should use /login, not /auth/signin (Task 8 bug fix)
      links.forEach((link) => {
        const href = link.getAttribute("href") ?? "";
        expect(href).toContain("https://community.example.com/login");
        expect(href).not.toContain("/auth/signin");
      });
    });

    it("shows ApplyButton for seeker", () => {
      render(
        <JobDetailPageContent
          {...makeProps({
            isSeeker: true,
            seekerProfile: { headline: "Engineer", skills: ["React"] },
          })}
        />,
      );
      const buttons = screen.getAllByTestId("apply-button");
      expect(buttons.length).toBeGreaterThan(0);
    });

    it("CTA bar is hidden for expired/filled postings", () => {
      render(<JobDetailPageContent {...makeProps({ isExpiredOrFilled: true, isFilled: false })} />);
      expect(screen.queryByTestId("apply-button")).toBeNull();
      expect(screen.queryByText("Portal.jobDetail.signInToApply")).toBeNull();
    });

    it("CTA bar is hidden for employer/admin", () => {
      render(<JobDetailPageContent {...makeProps({ isEmployerOrAdmin: true })} />);
      expect(screen.queryByTestId("apply-button")).toBeNull();
      expect(screen.queryByText("Portal.jobDetail.signInToApply")).toBeNull();
    });
  });

  describe("GuestConversionBanner (Task 7)", () => {
    it("renders GuestConversionBanner for guest on active posting", () => {
      render(<JobDetailPageContent {...makeProps({ isGuest: true, isExpiredOrFilled: false })} />);
      expect(screen.getByTestId("guest-conversion-banner")).toBeInTheDocument();
    });

    it("does NOT render GuestConversionBanner for authenticated seeker", () => {
      render(
        <JobDetailPageContent
          {...makeProps({
            isGuest: false,
            isSeeker: true,
            seekerProfile: { headline: "Engineer", skills: [] },
          })}
        />,
      );
      expect(screen.queryByTestId("guest-conversion-banner")).not.toBeInTheDocument();
    });

    it("does NOT render GuestConversionBanner for expired/filled posting", () => {
      render(<JobDetailPageContent {...makeProps({ isGuest: true, isExpiredOrFilled: true })} />);
      expect(screen.queryByTestId("guest-conversion-banner")).not.toBeInTheDocument();
    });
  });

  describe("ref=apply auto-open (Task 5)", () => {
    it("ref=apply when guest — no autoApply (still shows sign-in CTA)", () => {
      searchParamsRef.current = new URLSearchParams("ref=apply");
      render(<JobDetailPageContent {...makeProps({ isGuest: true, isSeeker: false })} />);
      const applyButtons = screen.queryAllByTestId("apply-button");
      // Guest sees sign-in link, not apply button
      expect(applyButtons.length).toBe(0);
      expect(screen.getAllByText("Portal.jobDetail.signInToApply").length).toBeGreaterThan(0);
    });

    it("ref=apply when authenticated seeker — passes autoApply=true to ApplyButton", () => {
      searchParamsRef.current = new URLSearchParams("ref=apply");
      render(
        <JobDetailPageContent
          {...makeProps({
            isGuest: false,
            isSeeker: true,
            seekerProfile: { headline: "Engineer", skills: [] },
          })}
        />,
      );
      const applyButtons = screen.getAllByTestId("apply-button");
      expect(applyButtons.length).toBeGreaterThan(0);
      expect(applyButtons[0]!.getAttribute("data-auto-apply")).toBe("true");
    });

    it("ref=unknown (invalid value) — autoApply is false", () => {
      searchParamsRef.current = new URLSearchParams("ref=unknown");
      render(
        <JobDetailPageContent
          {...makeProps({
            isGuest: false,
            isSeeker: true,
            seekerProfile: { headline: "Engineer", skills: [] },
          })}
        />,
      );
      const applyButtons = screen.getAllByTestId("apply-button");
      expect(applyButtons[0]!.getAttribute("data-auto-apply")).toBe("false");
    });
  });

  describe("back to jobs link", () => {
    it("renders back to jobs link", () => {
      render(<JobDetailPageContent {...makeProps()} />);
      // The back link contains "← " + i18n key text broken into separate text nodes; use role+name query
      const link = screen.getByRole("link", { name: /backToJobs/ });
      expect(link).toBeTruthy();
    });

    it("back to jobs link points to /jobs", () => {
      render(<JobDetailPageContent {...makeProps()} />);
      const link = screen.getByRole("link", { name: /backToJobs/ });
      expect(link.getAttribute("href")).toContain("/jobs");
    });
  });

  describe("Igbo locale", () => {
    it("uses provided locale for content rendering", () => {
      mockUseLocale.mockReturnValue("ig");
      render(<JobDetailPageContent {...makeProps({ locale: "ig" })} />);
      // The component renders heading — the i18n keys are mocked so we just verify it renders
      expect(screen.getByRole("heading", { level: 1, name: "Senior Engineer" })).toBeTruthy();
    });

    it("renders tab labels regardless of locale", () => {
      mockUseLocale.mockReturnValue("ig");
      render(<JobDetailPageContent {...makeProps({ locale: "ig" })} />);
      // Use getByRole("tab") to avoid multiple-match with h2 heading containing same key
      expect(screen.getByRole("tab", { name: "Portal.jobDetail.descriptionTab" })).toBeTruthy();
      expect(screen.getByRole("tab", { name: "Portal.jobDetail.companyInfoTab" })).toBeTruthy();
    });

    it("renders expired banner in ig locale", () => {
      mockUseLocale.mockReturnValue("ig");
      render(
        <JobDetailPageContent
          {...makeProps({ locale: "ig", isExpiredOrFilled: true, isFilled: false })}
        />,
      );
      expect(screen.getByText("Portal.jobDetail.expiredBanner")).toBeTruthy();
    });
  });

  describe("accessibility", () => {
    it("passes axe for full page render", async () => {
      const { container } = render(<JobDetailPageContent {...makeProps()} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("passes axe for expired banner state", async () => {
      const { container } = render(
        <JobDetailPageContent {...makeProps({ isExpiredOrFilled: true, isFilled: false })} />,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("passes axe for filled banner state", async () => {
      const { container } = render(
        <JobDetailPageContent {...makeProps({ isExpiredOrFilled: true, isFilled: true })} />,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("passes axe for guest CTA state", async () => {
      const { container } = render(<JobDetailPageContent {...makeProps({ isGuest: true })} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("heading hierarchy: h1 job title, h2 section headings", () => {
      render(<JobDetailPageContent {...makeProps()} />);
      const h1 = screen.getByRole("heading", { level: 1 });
      expect(h1.textContent).toBe("Senior Engineer");
      // Description tab section heading
      const h2s = screen.getAllByRole("heading", { level: 2 });
      expect(h2s.length).toBeGreaterThan(0);
    });
  });
});
