import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@/services/admin-analytics-service", () => ({
  getPlatformAnalytics: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
  getFormatter: vi.fn().mockResolvedValue({
    dateTime: (_date: Date, _opts: unknown) => "Apr 14, 2026, 10:00 AM",
  }),
}));
vi.mock("@/components/domain/admin-analytics-dashboard", () => ({
  AdminAnalyticsDashboard: ({ analytics }: { analytics: unknown }) => (
    <div
      data-testid="analytics-dashboard"
      data-generated-at={(analytics as { generatedAt: string }).generatedAt}
    />
  ),
}));

import React from "react";
import { auth } from "@igbo/auth";
import { getPlatformAnalytics } from "@/services/admin-analytics-service";
import Page from "./page";

const adminSession = { user: { id: "admin-1", activePortalRole: "JOB_ADMIN" } };

const mockAnalytics = {
  postings: {
    activeCount: { value: 10, trend: null },
    pendingReviewCount: { value: 3, trend: null },
    rejectedCount: { value: 2, trend: null },
    expiredCount: { value: 5, trend: null },
  },
  applications: {
    submittedCount: { value: 20, trend: null },
    avgPerPosting: { value: 5, trend: null },
    interviewConversionRate: { value: 0.5, trend: null },
  },
  hiring: {
    medianTimeToFillDays: { value: 14.5, trend: null },
    hiresCount: { value: 5, trend: null },
    offerAcceptRate: { value: 0.625, trend: null },
  },
  users: {
    activeSeekers: { value: 12, trend: null },
    activeEmployers: { value: 5, trend: null },
    newRegistrations: { value: 20, trend: null },
  },
  review: {
    avgReviewTimeMs: 120000,
    approvalRate: { value: 0.7, trend: null },
    rejectionRate: { value: 0.2, trend: null },
    changesRequestedRate: { value: 0.1, trend: null },
  },
  generatedAt: "2026-04-14T10:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPlatformAnalytics).mockResolvedValue(mockAnalytics as never);
});

async function renderPage() {
  const node = await Page({ params: Promise.resolve({ locale: "en" }) });
  return render(node as React.ReactElement);
}

describe("AdminAnalyticsPage", () => {
  it("redirects non-admin users", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "u1", activePortalRole: "EMPLOYER" },
    } as never);
    await expect(renderPage()).rejects.toThrow("REDIRECT:/en");
  });

  it("redirects unauthenticated users", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    await expect(renderPage()).rejects.toThrow("REDIRECT:/en");
  });

  it("renders analytics dashboard for JOB_ADMIN", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    await renderPage();
    expect(screen.getByTestId("analytics-dashboard")).toBeTruthy();
  });

  it("shows the last updated timestamp", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    await renderPage();
    expect(screen.getByText(/Apr 14, 2026/)).toBeInTheDocument();
  });
});
