// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("next-auth/react", () => ({
  useSession: vi.fn().mockReturnValue({ data: null, status: "unauthenticated", update: vi.fn() }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/en",
}));

vi.mock("@/hooks/use-active-portal-role", () => ({
  useActivePortalRole: () => ({
    role: null,
    isSeeker: false,
    isEmployer: false,
    isAdmin: false,
    isAuthenticated: false,
  }),
}));

// Mock child nav components to isolate PortalLayout
vi.mock("./portal-top-nav", () => ({
  PortalTopNav: () => <header data-testid="portal-top-nav">TopNav</header>,
}));

vi.mock("./portal-bottom-nav", () => ({
  PortalBottomNav: () => <nav data-testid="portal-bottom-nav">BottomNav</nav>,
}));

import { PortalLayout } from "./portal-layout";

describe("PortalLayout", () => {
  it("renders TopNav and BottomNav", () => {
    render(
      <PortalLayout>
        <div>Content</div>
      </PortalLayout>,
    );
    expect(screen.getByTestId("portal-top-nav")).toBeInTheDocument();
    expect(screen.getByTestId("portal-bottom-nav")).toBeInTheDocument();
  });

  it("renders main element with id='main-content' for skip link targeting", () => {
    render(
      <PortalLayout>
        <div>Content</div>
      </PortalLayout>,
    );
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main-content");
  });

  it("renders children inside main", () => {
    render(
      <PortalLayout>
        <div data-testid="child-content">Hello</div>
      </PortalLayout>,
    );
    expect(screen.getByTestId("child-content")).toBeInTheDocument();
  });
});
