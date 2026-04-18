// @vitest-environment jsdom
/**
 * Integration test for the ungated jobs discovery page.
 *
 * AC #1 evidence: Asserts the page renders with discovery data.
 * AC #5 evidence: Data is server-side fetched and passed as props (no client fetch).
 * AC #6 evidence: generateMetadata returns correct title.
 * AC #7: redirect-throws pattern for server component.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../../../messages/en.json";

expect.extend(toHaveNoViolations);

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));

vi.mock("@/services/job-search-service", () => ({
  getDiscoveryPageData: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: vi.fn().mockImplementation((_opts: unknown) =>
    Promise.resolve((key: string, opts?: Record<string, unknown>) => {
      if (opts) return `${key}(${JSON.stringify(opts)})`;
      return key;
    }),
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/en/jobs",
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/layout/portal-layout", () => ({
  PortalLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

beforeAll(() => {
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

// ─── Imports after mocks ───────────────────────────────────────────────────

import JobsDiscoveryPage, { generateMetadata } from "./page";
import { getDiscoveryPageData } from "@/services/job-search-service";

const mockGetDiscoveryPageData = vi.mocked(getDiscoveryPageData);

const sampleData = {
  featuredJobs: [
    {
      id: "f-1",
      title: "Featured Engineer",
      company_name: "TechCorp",
      company_id: "c-1",
      logo_url: null,
      location: "Lagos",
      salary_min: null,
      salary_max: null,
      salary_competitive_only: false,
      employment_type: "full_time" as const,
      cultural_context_json: null,
      application_deadline: null,
      created_at: "2026-04-01T00:00:00.000Z",
    },
  ],
  categories: [{ industry: "technology", count: 42 }],
  recentPostings: [
    {
      id: "r-1",
      title: "Recent Analyst",
      company_name: "FinCo",
      company_id: "c-2",
      logo_url: null,
      location: "Abuja",
      salary_min: null,
      salary_max: null,
      salary_competitive_only: false,
      employment_type: "full_time" as const,
      cultural_context_json: null,
      application_deadline: null,
      created_at: "2026-04-01T00:00:00.000Z",
    },
  ],
};

async function renderPage(locale = "en") {
  mockGetDiscoveryPageData.mockResolvedValue(sampleData);
  const node = await JobsDiscoveryPage({ params: Promise.resolve({ locale }) });
  return render(
    <NextIntlClientProvider locale={locale} messages={enMessages}>
      {node as React.ReactElement}
    </NextIntlClientProvider>,
  );
}

describe("JobsDiscoveryPage", () => {
  it("calls getDiscoveryPageData with the locale", async () => {
    await renderPage("en");
    expect(mockGetDiscoveryPageData).toHaveBeenCalledWith("en");
  });

  it("renders the h1 page heading", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("renders featured job title from service data", async () => {
    await renderPage();
    expect(screen.getByText("Featured Engineer")).toBeInTheDocument();
  });

  it("renders recent job title from service data", async () => {
    await renderPage();
    expect(screen.getByText("Recent Analyst")).toBeInTheDocument();
  });

  it("renders category from service data", async () => {
    await renderPage();
    expect(screen.getByText("Technology")).toBeInTheDocument();
  });

  it("renders cold-start empty state when service returns empty data", async () => {
    mockGetDiscoveryPageData.mockResolvedValue({
      featuredJobs: [],
      categories: [],
      recentPostings: [],
    });
    const node = await JobsDiscoveryPage({ params: Promise.resolve({ locale: "en" }) });
    const { screen: s } = await import("@testing-library/react");
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        {node as React.ReactElement}
      </NextIntlClientProvider>,
    );
    expect(s.getByText(/New opportunities are being added daily/i)).toBeInTheDocument();
  });

  it("passes axe-core assertion with full data", async () => {
    const { container } = await renderPage();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe("generateMetadata", () => {
  it("returns a title containing the page title translation key", async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: "en" }) });
    expect(meta.title).toBeTruthy();
    expect(typeof meta.title).toBe("string");
    // MEDIUM-8 review fix: verify actual content — mock translator returns key names,
    // so the title should be "pageTitle — OBIGBO Job Portal".
    expect(meta.title).toContain("pageTitle");
    expect(meta.title).toContain("OBIGBO Job Portal");
  });
});
