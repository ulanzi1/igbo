import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/require-company-profile", () => ({
  requireCompanyProfile: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));
vi.mock("@/components/flow/job-posting-form", () => ({
  JobPostingForm: ({ companyId }: { companyId: string }) => (
    <div data-testid="job-posting-form" data-company-id={companyId} />
  ),
  JobPostingFormSkeleton: () => <div>Skeleton</div>,
}));

import React from "react";
import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { requireCompanyProfile } from "@/lib/require-company-profile";
import Page from "./page";

expect.extend(toHaveNoViolations);

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
});

async function renderPage() {
  const node = await Page({ params: Promise.resolve({ locale: "en" }) });
  return render(node as React.ReactElement);
}

describe("NewJobPage", () => {
  it("renders form with companyId when profile exists", async () => {
    vi.mocked(requireCompanyProfile).mockResolvedValue(mockProfile as never);
    await renderPage();
    const form = screen.getByTestId("job-posting-form");
    expect(form.getAttribute("data-company-id")).toBe("company-uuid");
  });

  it("renders page heading", async () => {
    vi.mocked(requireCompanyProfile).mockResolvedValue(mockProfile as never);
    await renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    expect(screen.getByText("createTitle")).toBeTruthy();
  });

  it("redirects to portal home when requireCompanyProfile returns null (non-employer)", async () => {
    vi.mocked(requireCompanyProfile).mockResolvedValue(null as never);
    await expect(renderPage()).rejects.toThrow("REDIRECT:/en");
  });

  it("passes axe-core accessibility assertion", async () => {
    vi.mocked(requireCompanyProfile).mockResolvedValue(mockProfile as never);
    const { container } = await renderPage();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
