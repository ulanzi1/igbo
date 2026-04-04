import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/db/queries/portal-companies", () => ({
  getCompanyById: vi.fn(),
}));
vi.mock("@igbo/db/queries/cross-app", () => ({
  getCommunityTrustSignals: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));
vi.mock("@/components/semantic/trust-badge", () => ({
  TrustBadge: ({ trustSignals }: { trustSignals: unknown }) => (
    <div
      data-testid="trust-badge"
      data-verified={String((trustSignals as { isVerified: boolean }).isVerified)}
    />
  ),
  TrustBadgeSkeleton: () => <div>Skeleton</div>,
}));
vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import React from "react";
import { render, screen } from "@testing-library/react";
import { getCompanyById } from "@igbo/db/queries/portal-companies";
import { getCommunityTrustSignals } from "@igbo/db/queries/cross-app";
import Page from "./page";

const mockProfile = {
  id: "company-uuid",
  ownerUserId: "user-123",
  name: "Acme Corp",
  logoUrl: "https://example.com/logo.png",
  description: "A great company",
  industry: "technology",
  companySize: "11-50",
  cultureInfo: "Innovation first",
  trustBadge: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockTrustSignals = {
  isVerified: true,
  memberSince: new Date("2023-01-01"),
  displayName: "Ngozi",
  engagementLevel: "high" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCommunityTrustSignals).mockResolvedValue(mockTrustSignals);
});

async function renderPage(companyId = "company-uuid") {
  const node = await Page({
    params: Promise.resolve({ locale: "en", companyId }),
  });
  return render(node as React.ReactElement);
}

describe("CompanyDetailPage", () => {
  it("renders company profile with trust signals", async () => {
    vi.mocked(getCompanyById).mockResolvedValue(mockProfile);
    await renderPage();
    expect(screen.getByText("Acme Corp")).toBeTruthy();
    expect(screen.getByTestId("trust-badge")).toBeTruthy();
    expect(screen.getByTestId("trust-badge").getAttribute("data-verified")).toBe("true");
  });

  it("renders 404 for non-existent company", async () => {
    vi.mocked(getCompanyById).mockResolvedValue(null);
    await expect(renderPage("nonexistent")).rejects.toThrow("NOT_FOUND");
  });

  it("renders empty state for job postings", async () => {
    vi.mocked(getCompanyById).mockResolvedValue(mockProfile);
    await renderPage();
    expect(screen.getByText("noJobsYet")).toBeTruthy();
  });

  it("renders company logo if present", async () => {
    vi.mocked(getCompanyById).mockResolvedValue(mockProfile);
    await renderPage();
    const img = screen.getByRole("img");
    expect(img.getAttribute("src")).toBe("https://example.com/logo.png");
  });
});
