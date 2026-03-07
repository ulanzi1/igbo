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
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`;
    return key;
  },
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

import { ArticleLimitProgress } from "./ArticleLimitProgress";

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSession.mockReturnValue({ data: { user: { id: "user-1" } } });
});

describe("ArticleLimitProgress", () => {
  it("shows skeleton while loading", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true });

    render(<ArticleLimitProgress />);

    expect(screen.getByTestId("skeleton")).toBeTruthy();
  });

  it("shows article limit at baseline (limit=1, used=0)", () => {
    mockUseQuery.mockReturnValue({
      isLoading: false,
      data: {
        effectiveLimit: 1,
        weeklyUsed: 0,
        currentPoints: 0,
        nextThreshold: 500,
        nextEffectiveLimit: 2,
      },
    });

    render(<ArticleLimitProgress />);

    expect(screen.getByText("articleLimit.title")).toBeTruthy();
    // Check canPublish text rendered with params
    expect(screen.getByText((t) => t.includes("articleLimit.canPublish"))).toBeTruthy();
  });

  it("shows earnMore text when nextThreshold is set", () => {
    mockUseQuery.mockReturnValue({
      isLoading: false,
      data: {
        effectiveLimit: 1,
        weeklyUsed: 0,
        currentPoints: 200,
        nextThreshold: 500,
        nextEffectiveLimit: 2,
      },
    });

    render(<ArticleLimitProgress />);

    expect(screen.getByText((t) => t.includes("articleLimit.earnMore"))).toBeTruthy();
  });

  it("shows atMax message when nextThreshold is null", () => {
    mockUseQuery.mockReturnValue({
      isLoading: false,
      data: {
        effectiveLimit: 3,
        weeklyUsed: 1,
        currentPoints: 2000,
        nextThreshold: null,
        nextEffectiveLimit: null,
      },
    });

    render(<ArticleLimitProgress />);

    expect(screen.getByText("articleLimit.atMax")).toBeTruthy();
  });

  it("shows notEligible for BASIC tier (effectiveLimit=0)", () => {
    mockUseQuery.mockReturnValue({
      isLoading: false,
      data: {
        effectiveLimit: 0,
        weeklyUsed: 0,
        currentPoints: 100,
        nextThreshold: null,
        nextEffectiveLimit: null,
      },
    });

    render(<ArticleLimitProgress />);

    expect(screen.getByText("articleLimit.notEligible")).toBeTruthy();
  });

  it("returns null when no session", () => {
    mockUseSession.mockReturnValue({ data: null });
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false });

    const { container } = render(<ArticleLimitProgress />);

    expect(container.firstChild).toBeNull();
  });
});
