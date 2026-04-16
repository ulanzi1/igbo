import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-companies", () => ({ getCompanyByOwnerId: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));
vi.mock("@/components/domain/verification-form", () => ({
  VerificationForm: ({ companyId }: { companyId: string }) => (
    <div data-testid="verification-form" data-company-id={companyId} />
  ),
}));
vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  CardDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/separator", () => ({
  Separator: () => <hr />,
}));

import React from "react";
import { auth } from "@igbo/auth";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
import Page from "./page";

const mockSession = { user: { id: "user-1", activePortalRole: "EMPLOYER" } };
const mockProfile = { id: "company-1", name: "ACME Ltd" };

beforeEach(() => {
  vi.clearAllMocks();
});

async function renderPage() {
  const node = await Page({ params: Promise.resolve({ locale: "en" }) });
  return render(node as React.ReactElement);
}

describe("VerificationPage", () => {
  it("redirects non-employer users", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "u1", activePortalRole: "JOB_SEEKER" },
    } as never);
    await expect(renderPage()).rejects.toThrow("REDIRECT:/en");
  });

  it("redirects employer without company profile", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(getCompanyByOwnerId).mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow("REDIRECT:/en/company-profile");
  });

  it("renders verification form for employer with profile", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(getCompanyByOwnerId).mockResolvedValue(mockProfile as never);
    await renderPage();
    expect(screen.getByTestId("verification-form")).toBeTruthy();
    expect(screen.getByTestId("verification-form").getAttribute("data-company-id")).toBe(
      "company-1",
    );
  });
});
