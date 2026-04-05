import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { CulturalContextBadges } from "./cultural-context-badges";

describe("CulturalContextBadges", () => {
  it("renders all 3 badges when all flags are true", () => {
    const culturalContext = {
      diasporaFriendly: true,
      igboLanguagePreferred: true,
      communityReferred: true,
    };
    render(<CulturalContextBadges culturalContext={culturalContext} />);
    expect(screen.getByText("badgeDiaspora")).toBeTruthy();
    expect(screen.getByText("badgeIgbo")).toBeTruthy();
    expect(screen.getByText("badgeCommunity")).toBeTruthy();
  });

  it("renders only diaspora badge when only diasporaFriendly is true", () => {
    const culturalContext = {
      diasporaFriendly: true,
      igboLanguagePreferred: false,
      communityReferred: false,
    };
    render(<CulturalContextBadges culturalContext={culturalContext} />);
    expect(screen.getByText("badgeDiaspora")).toBeTruthy();
    expect(screen.queryByText("badgeIgbo")).toBeNull();
    expect(screen.queryByText("badgeCommunity")).toBeNull();
  });

  it("renders only igbo badge when only igboLanguagePreferred is true", () => {
    const culturalContext = {
      diasporaFriendly: false,
      igboLanguagePreferred: true,
      communityReferred: false,
    };
    render(<CulturalContextBadges culturalContext={culturalContext} />);
    expect(screen.queryByText("badgeDiaspora")).toBeNull();
    expect(screen.getByText("badgeIgbo")).toBeTruthy();
    expect(screen.queryByText("badgeCommunity")).toBeNull();
  });

  it("renders nothing when all flags are false", () => {
    const culturalContext = {
      diasporaFriendly: false,
      igboLanguagePreferred: false,
      communityReferred: false,
    };
    const { container } = render(<CulturalContextBadges culturalContext={culturalContext} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when culturalContext is null", () => {
    const { container } = render(<CulturalContextBadges culturalContext={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("badge text uses i18n keys (badgeDiaspora, badgeIgbo, badgeCommunity)", () => {
    const culturalContext = {
      diasporaFriendly: true,
      igboLanguagePreferred: true,
      communityReferred: true,
    };
    render(<CulturalContextBadges culturalContext={culturalContext} />);
    // With mock translator returning key as text
    expect(screen.getByText("badgeDiaspora")).toBeTruthy();
    expect(screen.getByText("badgeIgbo")).toBeTruthy();
    expect(screen.getByText("badgeCommunity")).toBeTruthy();
  });

  it("passes axe-core accessibility assertion", async () => {
    const culturalContext = {
      diasporaFriendly: true,
      igboLanguagePreferred: false,
      communityReferred: true,
    };
    const { container } = render(<CulturalContextBadges culturalContext={culturalContext} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
