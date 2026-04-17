import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-job-postings", () => ({
  getJobPostingWithCompany: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-seeker-profiles", () => ({
  getSeekerProfileByUserId: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-applications", () => ({
  getExistingActiveApplication: vi.fn(),
}));
vi.mock("@igbo/db/queries/auth-queries", () => ({
  findUserById: vi.fn().mockResolvedValue({
    id: "user-123",
    locationCity: "Lagos",
    locationState: "Lagos",
    locationCountry: "Nigeria",
  }),
}));
vi.mock("@/lib/sanitize", () => ({
  sanitizeHtml: vi.fn((html: string) => html),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string, params?: Record<string, unknown>) => {
    if (params) {
      return Object.entries(params).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), key);
    }
    return key;
  }),
}));
vi.mock("@/components/domain/job-detail-page-content", () => ({
  JobDetailPageContent: (props: Record<string, unknown>) => (
    <div
      data-testid="job-detail-page-content"
      data-job-id={props.jobId as string}
      data-is-guest={String(props.isGuest)}
      data-is-seeker={String(props.isSeeker)}
      data-is-employer-or-admin={String(props.isEmployerOrAdmin)}
      data-is-expired-or-filled={String(props.isExpiredOrFilled)}
      data-is-filled={String(props.isFilled)}
      data-has-existing-application={String(props.hasExistingApplication)}
      data-deadline-passed={String(props.deadlinePassed)}
    >
      {(props.posting as { title: string }).title}
    </div>
  ),
}));

import React from "react";
import { render, screen } from "@testing-library/react";
import { auth } from "@igbo/auth";
import { getJobPostingWithCompany } from "@igbo/db/queries/portal-job-postings";
import { getSeekerProfileByUserId } from "@igbo/db/queries/portal-seeker-profiles";
import { getExistingActiveApplication } from "@igbo/db/queries/portal-applications";
import { jobPostingFactory, companyProfileFactory, applicationFactory } from "@/test/factories";
import Page, { generateMetadata } from "./page";

const mockCompany = companyProfileFactory({ id: "company-uuid", name: "Acme Corp" });
const mockPosting = jobPostingFactory({
  id: "posting-uuid",
  companyId: "company-uuid",
  title: "Senior Engineer",
  status: "active",
  descriptionHtml: "<p>Great role</p>",
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(null);
  vi.mocked(getJobPostingWithCompany).mockResolvedValue({
    posting: mockPosting,
    company: mockCompany,
  } as never);
  vi.mocked(getExistingActiveApplication).mockResolvedValue(null);
  vi.mocked(getSeekerProfileByUserId).mockResolvedValue(null);
});

async function renderPage(locale = "en", jobId = "posting-uuid") {
  const node = await Page({ params: Promise.resolve({ locale, jobId }) });
  return render(node as React.ReactElement);
}

describe("JobDetailPage (ungated)", () => {
  describe("happy path — active posting", () => {
    it("renders job title via JobDetailPageContent", async () => {
      await renderPage();
      expect(screen.getByTestId("job-detail-page-content")).toBeTruthy();
      expect(screen.getByText("Senior Engineer")).toBeTruthy();
    });

    it("passes correct jobId to content component", async () => {
      await renderPage();
      const el = screen.getByTestId("job-detail-page-content");
      expect(el.getAttribute("data-job-id")).toBe("posting-uuid");
    });

    it("renders as guest when unauthenticated", async () => {
      await renderPage();
      const el = screen.getByTestId("job-detail-page-content");
      expect(el.getAttribute("data-is-guest")).toBe("true");
      expect(el.getAttribute("data-is-seeker")).toBe("false");
    });

    it("renders as seeker when authenticated with JOB_SEEKER role", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-123", activePortalRole: "JOB_SEEKER" },
      } as never);
      vi.mocked(getSeekerProfileByUserId).mockResolvedValue({
        id: "seeker-1",
        userId: "user-123",
      } as never);
      await renderPage();
      const el = screen.getByTestId("job-detail-page-content");
      expect(el.getAttribute("data-is-seeker")).toBe("true");
      expect(el.getAttribute("data-is-guest")).toBe("false");
    });

    it("renders as employer when authenticated with EMPLOYER role", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-123", activePortalRole: "EMPLOYER" },
      } as never);
      await renderPage();
      const el = screen.getByTestId("job-detail-page-content");
      expect(el.getAttribute("data-is-employer-or-admin")).toBe("true");
      expect(el.getAttribute("data-is-seeker")).toBe("false");
    });

    it("renders as admin when authenticated with JOB_ADMIN role", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "admin-123", activePortalRole: "JOB_ADMIN" },
      } as never);
      await renderPage();
      const el = screen.getByTestId("job-detail-page-content");
      expect(el.getAttribute("data-is-employer-or-admin")).toBe("true");
      expect(el.getAttribute("data-is-seeker")).toBe("false");
      expect(el.getAttribute("data-is-guest")).toBe("false");
    });

    it("marks hasExistingApplication when seeker has applied", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-123", activePortalRole: "JOB_SEEKER" },
      } as never);
      vi.mocked(getSeekerProfileByUserId).mockResolvedValue({
        id: "seeker-1",
        userId: "user-123",
      } as never);
      vi.mocked(getExistingActiveApplication).mockResolvedValue(
        applicationFactory({ jobId: "posting-uuid", seekerUserId: "user-123" }),
      );
      await renderPage();
      const el = screen.getByTestId("job-detail-page-content");
      expect(el.getAttribute("data-has-existing-application")).toBe("true");
    });
  });

  describe("404 statuses", () => {
    const notFoundStatuses = ["draft", "pending_review", "paused", "rejected"];

    for (const status of notFoundStatuses) {
      it(`returns 404 for status '${status}'`, async () => {
        vi.mocked(getJobPostingWithCompany).mockResolvedValue({
          posting: { ...mockPosting, status },
          company: mockCompany,
        } as never);
        await expect(renderPage()).rejects.toThrow("NOT_FOUND");
      });
    }

    it("returns 404 when posting is not found", async () => {
      vi.mocked(getJobPostingWithCompany).mockResolvedValue(null);
      await expect(renderPage()).rejects.toThrow("NOT_FOUND");
    });
  });

  describe("expired/filled statuses — banner (not 404)", () => {
    it("renders expired banner for status=expired (not 404)", async () => {
      vi.mocked(getJobPostingWithCompany).mockResolvedValue({
        posting: { ...mockPosting, status: "expired" },
        company: mockCompany,
      } as never);
      await renderPage();
      const el = screen.getByTestId("job-detail-page-content");
      expect(el.getAttribute("data-is-expired-or-filled")).toBe("true");
      expect(el.getAttribute("data-is-filled")).toBe("false");
    });

    it("renders filled banner for status=filled (not 404)", async () => {
      vi.mocked(getJobPostingWithCompany).mockResolvedValue({
        posting: { ...mockPosting, status: "filled" },
        company: mockCompany,
      } as never);
      await renderPage();
      const el = screen.getByTestId("job-detail-page-content");
      expect(el.getAttribute("data-is-expired-or-filled")).toBe("true");
      expect(el.getAttribute("data-is-filled")).toBe("true");
    });

    it("renders expired banner for active posting with past expiresAt", async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      vi.mocked(getJobPostingWithCompany).mockResolvedValue({
        posting: { ...mockPosting, status: "active", expiresAt: pastDate },
        company: mockCompany,
      } as never);
      await renderPage();
      const el = screen.getByTestId("job-detail-page-content");
      expect(el.getAttribute("data-is-expired-or-filled")).toBe("true");
      expect(el.getAttribute("data-is-filled")).toBe("false");
    });

    it("does NOT treat active posting with future expiresAt as expired", async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      vi.mocked(getJobPostingWithCompany).mockResolvedValue({
        posting: { ...mockPosting, status: "active", expiresAt: futureDate },
        company: mockCompany,
      } as never);
      await renderPage();
      const el = screen.getByTestId("job-detail-page-content");
      expect(el.getAttribute("data-is-expired-or-filled")).toBe("false");
    });
  });

  describe("deadline logic", () => {
    beforeEach(() => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-123", activePortalRole: "JOB_SEEKER" },
      } as never);
      vi.mocked(getSeekerProfileByUserId).mockResolvedValue({
        id: "seeker-1",
        userId: "user-123",
      } as never);
    });

    it("does not flag deadline passed when applicationDeadline is today (UTC midnight)", async () => {
      const todayMidnightUTC = new Date();
      todayMidnightUTC.setUTCHours(0, 0, 0, 0);
      vi.mocked(getJobPostingWithCompany).mockResolvedValue({
        posting: { ...mockPosting, applicationDeadline: todayMidnightUTC },
        company: mockCompany,
      } as never);
      await renderPage();
      const el = screen.getByTestId("job-detail-page-content");
      expect(el.getAttribute("data-deadline-passed")).toBe("false");
    });

    it("flags deadline passed when applicationDeadline was yesterday", async () => {
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      yesterday.setUTCHours(0, 0, 0, 0);
      vi.mocked(getJobPostingWithCompany).mockResolvedValue({
        posting: { ...mockPosting, applicationDeadline: yesterday },
        company: mockCompany,
      } as never);
      await renderPage();
      const el = screen.getByTestId("job-detail-page-content");
      expect(el.getAttribute("data-deadline-passed")).toBe("true");
    });

    it("does not flag deadline passed when applicationDeadline is null", async () => {
      vi.mocked(getJobPostingWithCompany).mockResolvedValue({
        posting: { ...mockPosting, applicationDeadline: null },
        company: mockCompany,
      } as never);
      await renderPage();
      const el = screen.getByTestId("job-detail-page-content");
      expect(el.getAttribute("data-deadline-passed")).toBe("false");
    });
  });

  describe("generateMetadata", () => {
    it("returns correct title when posting exists", async () => {
      const metadata = await generateMetadata({
        params: Promise.resolve({ locale: "en", jobId: "posting-uuid" }),
      });
      expect((metadata as { title?: string }).title).toBe(
        "Senior Engineer at Acme Corp | OBIGBO Job Portal",
      );
    });

    it("returns empty object when posting not found", async () => {
      vi.mocked(getJobPostingWithCompany).mockResolvedValue(null);
      const metadata = await generateMetadata({
        params: Promise.resolve({ locale: "en", jobId: "unknown" }),
      });
      expect(metadata).toEqual({});
    });
  });
});
