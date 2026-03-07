// @vitest-environment jsdom
// Smoke tests: confirms VerificationBadge renders correctly for each badge level
// in representative DOM contexts (not full component integration).
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/test-utils";

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (key === "ariaLabel") return `${params?.level} verification badge`;
    if (key === "tooltipLabel") return `${params?.level} Verified Member — ${params?.multiplier}x`;
    if (key === "blue") return "Community Verified";
    if (key === "red") return "Highly Trusted";
    if (key === "purple") return "Elite";
    return key;
  },
}));

vi.mock("@radix-ui/react-tooltip", () => ({
  Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Root: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Trigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Content: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Arrow: () => null,
}));

vi.mock("@/config/points", () => ({
  BADGE_MULTIPLIERS: { blue: 3, red: 6, purple: 10 },
}));

import { VerificationBadge } from "./VerificationBadge";

describe("VerificationBadge in representative DOM contexts", () => {
  it("1. inline with member display name", () => {
    render(
      <div>
        <p>
          Jane Doe <VerificationBadge badgeType="blue" />
        </p>
      </div>,
    );
    expect(screen.getByLabelText("Community Verified verification badge")).toBeInTheDocument();
  });

  it("2. inline with post author name", () => {
    render(
      <div>
        <a>
          John Smith <VerificationBadge badgeType="red" />
        </a>
      </div>,
    );
    expect(screen.getByLabelText("Highly Trusted verification badge")).toBeInTheDocument();
  });

  it("3. renders medium size variant in heading context", () => {
    render(
      <h1>
        Alice Nwosu <VerificationBadge badgeType="purple" size="md" />
      </h1>,
    );
    expect(screen.getByLabelText("Elite verification badge")).toBeInTheDocument();
  });

  it("4. blue badge in inline span context", () => {
    render(
      <span>
        Dr. Chukwu <VerificationBadge badgeType="blue" />
      </span>,
    );
    expect(screen.getByLabelText("Community Verified verification badge")).toBeInTheDocument();
  });

  it("5. red badge in inline span context", () => {
    render(
      <span>
        Eze Okafor <VerificationBadge badgeType="red" />
      </span>,
    );
    expect(screen.getByLabelText("Highly Trusted verification badge")).toBeInTheDocument();
  });

  it("6. purple badge in paragraph context", () => {
    render(
      <p>
        Amaka Nzé <VerificationBadge badgeType="purple" />
      </p>,
    );
    expect(screen.getByLabelText("Elite verification badge")).toBeInTheDocument();
  });

  it("7. blue badge in another inline span context", () => {
    render(
      <span>
        Kelechi Eze <VerificationBadge badgeType="blue" />
      </span>,
    );
    expect(screen.getByLabelText("Community Verified verification badge")).toBeInTheDocument();
  });
});
