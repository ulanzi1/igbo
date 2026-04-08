import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-seeker-profiles", () => ({
  getSeekerProfileById: vi.fn(),
}));
vi.mock("@igbo/db/queries/cross-app", () => ({
  getSeekerTrustSignals: vi.fn(),
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
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));
vi.mock("@/components/domain/seeker-profile-view", () => ({
  SeekerProfileView: ({
    profile,
    editable,
  }: {
    profile: { headline: string };
    editable: boolean;
  }) => (
    <div
      data-testid="seeker-profile-view"
      data-editable={String(editable)}
      data-headline={profile.headline}
    />
  ),
}));
vi.mock("@/components/semantic/trust-signals-panel", () => ({
  TrustSignalsPanel: ({ signals }: { signals: { communityPoints: number } }) => (
    <div data-testid="trust-signals-panel" data-points={signals.communityPoints} />
  ),
}));
vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import React from "react";
import { render, screen } from "@testing-library/react";
import { auth } from "@igbo/auth";
import { getSeekerProfileById } from "@igbo/db/queries/portal-seeker-profiles";
import { getSeekerTrustSignals } from "@igbo/db/queries/cross-app";
import Page from "./page";

const employerSession = {
  user: { id: "employer-123", activePortalRole: "EMPLOYER" },
};

const adminSession = {
  user: { id: "admin-123", activePortalRole: "JOB_ADMIN" },
};

const seekerSession = {
  user: { id: "seeker-123", activePortalRole: "JOB_SEEKER" },
};

const mockProfile = {
  id: "seeker-uuid",
  userId: "user-seeker",
  headline: "Senior Engineer",
  summary: null,
  skills: [],
  experienceJson: [],
  educationJson: [],
  visibility: "active",
  consentMatching: false,
  consentEmployerView: false,
  consentMatchingChangedAt: null,
  consentEmployerViewChangedAt: null,
  onboardingCompletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockSignals = {
  isVerified: true,
  badgeType: "blue",
  memberSince: new Date("2023-01-01"),
  memberDurationDays: 400,
  communityPoints: 750,
  engagementLevel: "high" as const,
  displayName: "Chidi",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(
    employerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
  );
  vi.mocked(getSeekerProfileById).mockResolvedValue(mockProfile);
  vi.mocked(getSeekerTrustSignals).mockResolvedValue(mockSignals);
});

async function renderPage(seekerProfileId = "seeker-uuid") {
  const node = await Page({
    params: Promise.resolve({ locale: "en", seekerProfileId }),
  });
  return render(node as React.ReactElement);
}

describe("SeekerProfilePage", () => {
  it("employer sees seeker profile view", async () => {
    await renderPage();
    expect(screen.getByTestId("seeker-profile-view")).toBeTruthy();
    expect(screen.getByTestId("seeker-profile-view").getAttribute("data-headline")).toBe(
      "Senior Engineer",
    );
  });

  it("employer sees trust signals panel", async () => {
    await renderPage();
    expect(screen.getByTestId("trust-signals-panel")).toBeTruthy();
    expect(screen.getByTestId("trust-signals-panel").getAttribute("data-points")).toBe("750");
  });

  it("admin can also see the seeker profile", async () => {
    vi.mocked(auth).mockResolvedValue(
      adminSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    );
    await renderPage();
    expect(screen.getByTestId("seeker-profile-view")).toBeTruthy();
    expect(screen.getByTestId("trust-signals-panel")).toBeTruthy();
  });

  it("renders profile as non-editable", async () => {
    await renderPage();
    expect(screen.getByTestId("seeker-profile-view").getAttribute("data-editable")).toBe("false");
  });

  it("JOB_SEEKER role throws notFound", async () => {
    vi.mocked(auth).mockResolvedValue(
      seekerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    );
    await expect(renderPage()).rejects.toThrow("NOT_FOUND");
  });

  it("unauthenticated request throws notFound", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    await expect(renderPage()).rejects.toThrow("NOT_FOUND");
  });

  it("missing profile throws notFound", async () => {
    vi.mocked(getSeekerProfileById).mockResolvedValue(null);
    await expect(renderPage("nonexistent")).rejects.toThrow("NOT_FOUND");
  });

  it("passes seekerProfileId from params to query", async () => {
    await renderPage("my-specific-id");
    expect(getSeekerProfileById).toHaveBeenCalledWith("my-specific-id");
  });
});
