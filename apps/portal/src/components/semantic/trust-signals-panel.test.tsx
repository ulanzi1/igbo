import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { TrustSignalsPanel } from "./trust-signals-panel";

expect.extend(toHaveNoViolations);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string | number>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}));

vi.mock("lucide-react", () => ({
  ShieldCheck: () => <svg data-testid="shield-icon" />,
}));

import React from "react";

const baseSignals = {
  isVerified: false,
  badgeType: null as string | null,
  memberSince: new Date("2023-06-15"),
  memberDurationDays: 300,
  communityPoints: 450,
  engagementLevel: "medium" as const,
  displayName: "Chidi Okeke",
};

describe("TrustSignalsPanel", () => {
  it("renders verification row when isVerified=true", () => {
    render(<TrustSignalsPanel signals={{ ...baseSignals, isVerified: true }} />);
    expect(screen.getByTestId("shield-icon")).toBeTruthy();
    expect(screen.getByText("verifiedMember")).toBeTruthy();
  });

  it("omits verification row when isVerified=false", () => {
    render(<TrustSignalsPanel signals={{ ...baseSignals, isVerified: false }} />);
    expect(screen.queryByTestId("shield-icon")).toBeNull();
  });

  it("omits badge pill when badgeType is null", () => {
    render(<TrustSignalsPanel signals={{ ...baseSignals, badgeType: null }} />);
    expect(screen.queryByText("badgeBlue")).toBeNull();
    expect(screen.queryByText("badgeRed")).toBeNull();
    expect(screen.queryByText("badgePurple")).toBeNull();
  });

  it("renders blue badge pill when badgeType=blue", () => {
    render(<TrustSignalsPanel signals={{ ...baseSignals, badgeType: "blue" }} />);
    expect(screen.getByText("badgeBlue")).toBeTruthy();
  });

  it("renders red badge pill when badgeType=red", () => {
    render(<TrustSignalsPanel signals={{ ...baseSignals, badgeType: "red" }} />);
    expect(screen.getByText("badgeRed")).toBeTruthy();
  });

  it("renders purple badge pill when badgeType=purple", () => {
    render(<TrustSignalsPanel signals={{ ...baseSignals, badgeType: "purple" }} />);
    expect(screen.getByText("badgePurple")).toBeTruthy();
  });

  it("renders community points", () => {
    render(<TrustSignalsPanel signals={{ ...baseSignals, communityPoints: 600 }} />);
    expect(screen.getByText(/communityPoints/)).toBeTruthy();
  });

  it("renders engagement pill with correct label for high", () => {
    render(<TrustSignalsPanel signals={{ ...baseSignals, engagementLevel: "high" }} />);
    expect(screen.getByText("engagementHigh")).toBeTruthy();
  });

  it("renders engagement pill with correct label for low", () => {
    render(<TrustSignalsPanel signals={{ ...baseSignals, engagementLevel: "low" }} />);
    expect(screen.getByText("engagementLow")).toBeTruthy();
  });

  it("renders member-since line when memberSince is set", () => {
    render(<TrustSignalsPanel signals={{ ...baseSignals, memberSince: new Date("2022-01-01") }} />);
    expect(screen.getByText(/memberSince/)).toBeTruthy();
  });

  it("passes axe-core accessibility assertion", async () => {
    const { container } = render(
      <TrustSignalsPanel signals={{ ...baseSignals, isVerified: true, badgeType: "blue" }} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
