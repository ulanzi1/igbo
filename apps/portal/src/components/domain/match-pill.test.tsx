// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { axe, toHaveNoViolations } from "jest-axe";
import { renderWithPortalProviders, screen } from "@/test-utils/render";
import { MatchPill } from "./match-pill";
import type { MatchScoreResult } from "@igbo/config";

expect.extend(toHaveNoViolations);

const makeScore = (score: number, tier: MatchScoreResult["tier"]): MatchScoreResult => ({
  score,
  tier,
  signals: { skillsOverlap: 0, locationMatch: false, employmentTypeMatch: false },
});

describe("MatchPill — rendering", () => {
  it("renders score and tier label for strong tier", () => {
    renderWithPortalProviders(<MatchPill matchScore={makeScore(85, "strong")} />);
    const pill = screen.getByTestId("match-pill");
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveTextContent("85%");
    expect(pill).toHaveTextContent("Strong Match");
  });

  it("renders score and tier label for good tier", () => {
    renderWithPortalProviders(<MatchPill matchScore={makeScore(62, "good")} />);
    const pill = screen.getByTestId("match-pill");
    expect(pill).toHaveTextContent("62%");
    expect(pill).toHaveTextContent("Good Match");
  });

  it("renders score and tier label for fair tier", () => {
    renderWithPortalProviders(<MatchPill matchScore={makeScore(38, "fair")} />);
    const pill = screen.getByTestId("match-pill");
    expect(pill).toHaveTextContent("38%");
    expect(pill).toHaveTextContent("Fair Match");
  });

  it("does NOT render for tier 'none' (score < 30)", () => {
    renderWithPortalProviders(<MatchPill matchScore={makeScore(15, "none")} />);
    expect(screen.queryByTestId("match-pill")).not.toBeInTheDocument();
  });
});

describe("MatchPill — variant / color class", () => {
  it("uses success variant for strong tier", () => {
    renderWithPortalProviders(<MatchPill matchScore={makeScore(85, "strong")} />);
    const pill = screen.getByTestId("match-pill");
    expect(pill.getAttribute("data-variant")).toBe("success");
  });

  it("applies amber class for good tier", () => {
    renderWithPortalProviders(<MatchPill matchScore={makeScore(62, "good")} />);
    const pill = screen.getByTestId("match-pill");
    expect(pill.classList.toString()).toContain("bg-amber-100");
  });

  it("applies orange class for fair tier", () => {
    renderWithPortalProviders(<MatchPill matchScore={makeScore(38, "fair")} />);
    const pill = screen.getByTestId("match-pill");
    expect(pill.classList.toString()).toContain("bg-orange-50");
  });
});

describe("MatchPill — accessibility", () => {
  it("includes aria-label with score for screen readers", () => {
    renderWithPortalProviders(<MatchPill matchScore={makeScore(85, "strong")} />);
    const pill = screen.getByTestId("match-pill");
    const ariaLabel = pill.getAttribute("aria-label");
    expect(ariaLabel).not.toBeNull();
    expect(ariaLabel).toContain("85");
  });

  it("passes axe check for strong tier", async () => {
    const { container } = renderWithPortalProviders(
      <MatchPill matchScore={makeScore(85, "strong")} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("passes axe check for good tier", async () => {
    const { container } = renderWithPortalProviders(
      <MatchPill matchScore={makeScore(62, "good")} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
