import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-seeker-profiles", () => ({
  getSeekerProfileByUserId: vi.fn(),
}));
vi.mock("@igbo/db/queries/cross-app", () => ({
  getCommunityProfileForPrefill: vi.fn(),
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
vi.mock("@/components/flow/seeker-profile-form", () => ({
  SeekerProfileForm: ({
    mode,
    prefill,
    initialData,
  }: {
    mode: string;
    prefill?: { displayName: string | null; bio: string | null };
    initialData?: unknown;
  }) => (
    <div
      data-testid="seeker-profile-form"
      data-mode={mode}
      data-prefill={prefill ? JSON.stringify(prefill) : undefined}
      data-initial={initialData ? "true" : undefined}
    />
  ),
  SeekerProfileFormSkeleton: () => <div>Skeleton</div>,
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
vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import React from "react";
import { render, screen } from "@testing-library/react";
import { auth } from "@igbo/auth";
import { getSeekerProfileByUserId } from "@igbo/db/queries/portal-seeker-profiles";
import { getCommunityProfileForPrefill } from "@igbo/db/queries/cross-app";
import Page from "./page";

const seekerSession = {
  user: { id: "user-123", activePortalRole: "JOB_SEEKER" },
};

const mockProfile = {
  id: "seeker-uuid",
  userId: "user-123",
  headline: "Senior Engineer",
  summary: null,
  skills: [],
  experienceJson: [],
  educationJson: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(
    seekerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
  );
});

async function renderPage(searchParamsOverride?: Record<string, string>) {
  const node = await Page({
    params: Promise.resolve({ locale: "en" }),
    searchParams: Promise.resolve(searchParamsOverride ?? {}),
  });
  return render(node as React.ReactElement);
}

describe("ProfilePage", () => {
  it("renders create form when no profile exists", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(null);
    vi.mocked(getCommunityProfileForPrefill).mockResolvedValue({
      displayName: null,
      bio: null,
    });
    await renderPage();
    const form = screen.getByTestId("seeker-profile-form");
    expect(form.getAttribute("data-mode")).toBe("create");
  });

  it("passes prefill data from community profile in create mode", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(null);
    vi.mocked(getCommunityProfileForPrefill).mockResolvedValue({
      displayName: "Ngozi",
      bio: "Builder",
    });
    await renderPage();
    const form = screen.getByTestId("seeker-profile-form");
    const prefill = JSON.parse(form.getAttribute("data-prefill") ?? "null");
    expect(prefill.displayName).toBe("Ngozi");
    expect(prefill.bio).toBe("Builder");
  });

  it("renders view mode when profile exists (no edit param)", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    await renderPage();
    expect(screen.getByTestId("seeker-profile-view")).toBeTruthy();
    expect(screen.queryByTestId("seeker-profile-form")).toBeNull();
  });

  it("renders view with editable=true for profile owner", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    await renderPage();
    expect(screen.getByTestId("seeker-profile-view").getAttribute("data-editable")).toBe("true");
  });

  it("renders edit form when profile exists and edit=true", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    await renderPage({ edit: "true" });
    const form = screen.getByTestId("seeker-profile-form");
    expect(form.getAttribute("data-mode")).toBe("edit");
    expect(form.getAttribute("data-initial")).toBe("true");
  });

  it("redirects non-seeker to home", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-456", activePortalRole: "EMPLOYER" },
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);

    await expect(renderPage()).rejects.toThrow("REDIRECT:/en");
  });

  it("redirects unauthenticated user to home", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    await expect(renderPage()).rejects.toThrow("REDIRECT:/en");
  });

  it("uses session user id to fetch profile", async () => {
    vi.mocked(getSeekerProfileByUserId).mockResolvedValue(mockProfile);
    await renderPage();
    expect(getSeekerProfileByUserId).toHaveBeenCalledWith("user-123");
  });
});
