import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-employer-verifications", () => ({
  getVerificationById: vi.fn(),
  getVerificationHistoryForCompany: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-admin-flags", () => ({
  countOpenViolationsForCompany: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-companies", () => ({
  getCompanyById: vi.fn(),
}));
vi.mock("@igbo/db/queries/auth-queries", () => ({
  findUserById: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));
vi.mock("@/components/domain/verification-review-detail", () => ({
  VerificationReviewDetail: ({ verification }: { verification: { id: string } }) => (
    <div data-testid="review-detail" data-id={verification.id} />
  ),
}));
vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  CardDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: { children: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import React from "react";
import { auth } from "@igbo/auth";
import {
  getVerificationById,
  getVerificationHistoryForCompany,
} from "@igbo/db/queries/portal-employer-verifications";
import { countOpenViolationsForCompany } from "@igbo/db/queries/portal-admin-flags";
import { getCompanyById } from "@igbo/db/queries/portal-companies";
import { findUserById } from "@igbo/db/queries/auth-queries";
import Page from "./page";

const adminSession = { user: { id: "admin-1", activePortalRole: "JOB_ADMIN" } };
const mockVerification = {
  id: "ver-1",
  companyId: "company-1",
  submittedDocuments: [],
  status: "pending",
  adminNotes: null,
  submittedAt: new Date(),
  reviewedAt: null,
  reviewedByAdminId: null,
  createdAt: new Date(),
};
const mockCompany = { id: "company-1", name: "ACME Ltd", ownerUserId: "user-1" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getVerificationHistoryForCompany).mockResolvedValue([]);
  vi.mocked(countOpenViolationsForCompany).mockResolvedValue(0);
  vi.mocked(getCompanyById).mockResolvedValue(mockCompany as never);
  vi.mocked(findUserById).mockResolvedValue({ name: "John Doe", email: "j@example.com" } as never);
});

async function renderPage(verificationId = "ver-1") {
  const node = await Page({
    params: Promise.resolve({ locale: "en", verificationId }),
  });
  return render(node as React.ReactElement);
}

describe("AdminVerificationDetailPage", () => {
  it("redirects non-admin users", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "u1", activePortalRole: "EMPLOYER" },
    } as never);
    await expect(renderPage()).rejects.toThrow("REDIRECT:/en");
  });

  it("calls notFound when verification does not exist", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    vi.mocked(getVerificationById).mockResolvedValue(null);
    await expect(renderPage("ver-x")).rejects.toThrow("NOT_FOUND");
  });

  it("renders review detail for existing verification", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    vi.mocked(getVerificationById).mockResolvedValue(mockVerification as never);
    await renderPage();
    expect(screen.getByTestId("review-detail")).toBeTruthy();
    expect(screen.getByTestId("review-detail").getAttribute("data-id")).toBe("ver-1");
  });

  it("includes open violation count in enriched data", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    vi.mocked(getVerificationById).mockResolvedValue(mockVerification as never);
    vi.mocked(countOpenViolationsForCompany).mockResolvedValue(5);
    await renderPage();
    expect(screen.getByTestId("review-detail")).toBeTruthy();
  });
});
