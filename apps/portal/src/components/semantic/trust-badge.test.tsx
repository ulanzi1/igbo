import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { TrustBadge } from "./trust-badge";
import type { CommunityTrustSignals } from "@igbo/db/queries/cross-app";

expect.extend(toHaveNoViolations);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}));

const baseTrustSignals: CommunityTrustSignals = {
  isVerified: false,
  memberSince: new Date("2022-06-15"),
  displayName: "Ngozi Okonkwo",
  engagementLevel: "medium",
};

describe("TrustBadge", () => {
  it("renders verification badge for verified user", () => {
    const signals = { ...baseTrustSignals, isVerified: true };
    render(<TrustBadge trustSignals={signals} />);
    expect(screen.getByText("verifiedMember")).toBeTruthy();
  });

  it("does not render verification badge for unverified user", () => {
    render(<TrustBadge trustSignals={baseTrustSignals} />);
    expect(screen.queryByText("verifiedMember")).toBeNull();
  });

  it("renders correct engagement level pill", () => {
    const signals = { ...baseTrustSignals, engagementLevel: "high" as const };
    render(<TrustBadge trustSignals={signals} />);
    expect(screen.getByText("engagementHigh")).toBeTruthy();
  });

  it("passes axe-core accessibility assertion", async () => {
    const { container } = render(<TrustBadge trustSignals={baseTrustSignals} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
