// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/test-utils";

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    const map: Record<string, string> = {
      blue: "Community Verified",
      red: "Highly Trusted",
      purple: "Elite",
    };
    if (key === "tooltipLabel") {
      return `${params?.level} Verified Member — ${params?.multiplier}x points on likes`;
    }
    if (key === "ariaLabel") {
      return `${params?.level} verification badge`;
    }
    return map[key] ?? key;
  },
}));

// Mock Radix Tooltip to render children + content without portal
vi.mock("@radix-ui/react-tooltip", () => ({
  Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Root: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Trigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Content: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
  Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Arrow: () => null,
}));

vi.mock("@/config/points", () => ({
  BADGE_MULTIPLIERS: { blue: 3, red: 6, purple: 10 },
}));

import { VerificationBadge } from "./VerificationBadge";

describe("VerificationBadge", () => {
  it("1. renders nothing for null badgeType", () => {
    const { container } = render(<VerificationBadge badgeType={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("2. renders nothing for undefined badgeType", () => {
    const { container } = render(<VerificationBadge badgeType={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("3. renders ShieldCheck (svg) with text-blue-500 class for blue badge", () => {
    const { container } = render(<VerificationBadge badgeType="blue" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg?.getAttribute("class")).toContain("text-blue-500");
  });

  it("4. renders BadgeCheck (svg) with text-red-500 class for red badge", () => {
    const { container } = render(<VerificationBadge badgeType="red" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg?.getAttribute("class")).toContain("text-red-500");
  });

  it("5. renders Crown (svg) with text-purple-500 class for purple badge", () => {
    const { container } = render(<VerificationBadge badgeType="purple" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg?.getAttribute("class")).toContain("text-purple-500");
  });

  it("6. renders correct aria-label for blue badge", () => {
    render(<VerificationBadge badgeType="blue" />);
    expect(screen.getByLabelText("Community Verified verification badge")).toBeInTheDocument();
  });

  it("7. renders correct tooltip content for blue badge", () => {
    render(<VerificationBadge badgeType="blue" />);
    expect(screen.getByTestId("tooltip-content")).toHaveTextContent(
      "Community Verified Verified Member — 3x points on likes",
    );
  });

  it("8. renders correct tooltip content for purple badge", () => {
    render(<VerificationBadge badgeType="purple" />);
    expect(screen.getByTestId("tooltip-content")).toHaveTextContent(
      "Elite Verified Member — 10x points on likes",
    );
  });
});
