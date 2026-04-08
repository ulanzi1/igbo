import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { SeekerProfileView } from "./seeker-profile-view";

expect.extend(toHaveNoViolations);

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string, params?: Record<string, string | number>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string | { pathname: string; query?: Record<string, string> };
    children: React.ReactNode;
  }) => {
    const hrefStr =
      typeof href === "string"
        ? href
        : `${href.pathname}${href.query ? "?" + new URLSearchParams(href.query).toString() : ""}`;
    return (
      <a href={hrefStr} {...props}>
        {children}
      </a>
    );
  },
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="badge">{children}</span>
  ),
}));

import React from "react";

const fullProfile = {
  id: "seeker-uuid",
  userId: "user-123",
  headline: "Senior Engineer",
  summary: "I build things with care.",
  skills: ["TypeScript", "React", "Node.js"],
  experienceJson: [
    {
      title: "Senior Engineer",
      company: "Acme Corp",
      startDate: "2021-03",
      endDate: "Present",
      description: "Led platform team.",
    },
  ],
  educationJson: [
    {
      institution: "MIT",
      degree: "BSc",
      field: "Computer Science",
      graduationYear: 2020,
    },
  ],
  visibility: "active",
  consentMatching: false,
  consentEmployerView: false,
  consentMatchingChangedAt: null,
  consentEmployerViewChangedAt: null,
  onboardingCompletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const emptyProfile = {
  ...fullProfile,
  summary: null,
  skills: [],
  experienceJson: [],
  educationJson: [],
};

async function renderView(props: Parameters<typeof SeekerProfileView>[0]) {
  const ui = await SeekerProfileView(props);
  return render(ui as React.ReactElement);
}

describe("SeekerProfileView", () => {
  it("renders all sections with data", async () => {
    await renderView({ profile: fullProfile, editable: false });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Senior Engineer");
    expect(screen.getByText("I build things with care.")).toBeTruthy();
    expect(screen.getByText("TypeScript")).toBeTruthy();
    expect(screen.getByText("React")).toBeTruthy();
    expect(screen.getByText(/Senior Engineer.*Acme Corp/)).toBeTruthy();
    expect(screen.getByText("MIT")).toBeTruthy();
  });

  it("renders skills empty state when skills array is empty", async () => {
    await renderView({ profile: emptyProfile, editable: false });
    expect(screen.getByText("skillsEmpty")).toBeTruthy();
    expect(screen.queryAllByTestId("badge")).toHaveLength(0);
  });

  it("renders experience empty state when experience array is empty", async () => {
    await renderView({ profile: emptyProfile, editable: false });
    expect(screen.getByText("experienceEmpty")).toBeTruthy();
  });

  it("renders education empty state when education array is empty", async () => {
    await renderView({ profile: emptyProfile, editable: false });
    expect(screen.getByText("educationEmpty")).toBeTruthy();
  });

  it("Edit link appears when editable=true", async () => {
    await renderView({ profile: fullProfile, editable: true });
    const link = screen.getByRole("link", { name: "edit" });
    expect(link).toBeTruthy();
    expect((link as HTMLAnchorElement).getAttribute("href")).toContain("/profile?edit=true");
  });

  it("Edit link is hidden when editable=false", async () => {
    await renderView({ profile: fullProfile, editable: false });
    expect(screen.queryByRole("link", { name: "edit" })).toBeNull();
  });

  it("renders section headings for skills, experience, education", async () => {
    await renderView({ profile: fullProfile, editable: false });
    expect(screen.getByText("skillsSection")).toBeTruthy();
    expect(screen.getByText("experienceSection")).toBeTruthy();
    expect(screen.getByText("educationSection")).toBeTruthy();
  });

  it("renders education degree/field via i18n key (no hardcoded English)", async () => {
    await renderView({ profile: fullProfile, editable: false });
    // Our mock stringifies params — ensures the key was called with both fields
    expect(
      screen.getByText(/educationInField:.*"degree":"BSc".*"field":"Computer Science"/),
    ).toBeTruthy();
  });

  it("passes axe-core accessibility assertion", async () => {
    const { container } = await renderView({
      profile: fullProfile,
      editable: false,
    });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
