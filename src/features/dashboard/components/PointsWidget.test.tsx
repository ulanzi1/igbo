// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/test-utils";

const mockUseSession = vi.fn();
vi.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
}));

const mockUseQuery = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

const mockUseReducedMotion = vi.fn().mockReturnValue(false);
vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => mockUseReducedMotion(),
}));

import { PointsWidget } from "./PointsWidget";

beforeEach(() => {
  vi.clearAllMocks();
  mockUseReducedMotion.mockReturnValue(false);
  mockUseSession.mockReturnValue({ data: { user: { id: "user-1" } } });
});

describe("PointsWidget", () => {
  it("renders balance when data is loaded (reduced motion = no animation)", () => {
    mockUseReducedMotion.mockReturnValue(true); // skip animation so balance shown immediately
    mockUseQuery.mockReturnValue({
      data: { balance: 42, summary: { total: 42, thisWeek: 5, thisMonth: 20 } },
      isLoading: false,
    });

    render(<PointsWidget />);

    expect(screen.getByText("42")).toBeTruthy();
  });

  it("has amber accent class on the card", () => {
    mockUseReducedMotion.mockReturnValue(true);
    mockUseQuery.mockReturnValue({
      data: { balance: 10, summary: { total: 10, thisWeek: 2, thisMonth: 5 } },
      isLoading: false,
    });

    const { container } = render(<PointsWidget />);

    expect(container.innerHTML).toContain("amber");
  });

  it("shows CTA text when balance is 0", () => {
    mockUseQuery.mockReturnValue({
      data: { balance: 0, summary: { total: 0, thisWeek: 0, thisMonth: 0 } },
      isLoading: false,
    });

    render(<PointsWidget />);

    expect(screen.getByText("widget.zeroState")).toBeTruthy();
  });

  it("shows skeleton when loading", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true });

    render(<PointsWidget />);

    expect(screen.getByTestId("skeleton")).toBeTruthy();
  });

  it("returns null when no session", () => {
    mockUseSession.mockReturnValue({ data: null });
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false });

    const { container } = render(<PointsWidget />);

    expect(container.firstChild).toBeNull();
  });
});
