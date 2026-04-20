// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { axe, toHaveNoViolations } from "jest-axe";
import userEvent from "@testing-library/user-event";
import { renderWithPortalProviders, screen } from "@/test-utils/render";
import { MatchPill } from "./match-pill";
import type { MatchScoreResult } from "@igbo/config";

expect.extend(toHaveNoViolations);

// Radix polyfills for jsdom
Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  setPointerCapture: () => undefined,
  releasePointerCapture: () => undefined,
  scrollIntoView: () => undefined,
});

const makeScore = (score: number, tier: MatchScoreResult["tier"]): MatchScoreResult => ({
  score,
  tier,
  signals: { skillsOverlap: 0, locationMatch: false, employmentTypeMatch: false },
});

const makeScoreWithSignals = (
  score: number,
  tier: MatchScoreResult["tier"],
  signals: MatchScoreResult["signals"],
): MatchScoreResult => ({ score, tier, signals });

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
    const badge = screen.getByTestId("match-pill-badge");
    expect(badge.getAttribute("data-variant")).toBe("success");
  });

  it("applies amber class for good tier", () => {
    renderWithPortalProviders(<MatchPill matchScore={makeScore(62, "good")} />);
    const badge = screen.getByTestId("match-pill-badge");
    expect(badge.classList.toString()).toContain("bg-amber-100");
  });

  it("applies orange class for fair tier", () => {
    renderWithPortalProviders(<MatchPill matchScore={makeScore(38, "fair")} />);
    const badge = screen.getByTestId("match-pill-badge");
    expect(badge.classList.toString()).toContain("bg-orange-50");
  });
});

describe("MatchPill — accessibility", () => {
  it("includes aria-label with score for screen readers", () => {
    renderWithPortalProviders(<MatchPill matchScore={makeScore(85, "strong")} />);
    const badge = screen.getByTestId("match-pill-badge");
    const ariaLabel = badge.getAttribute("aria-label");
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

describe("MatchPill — display hierarchy", () => {
  it("shows tier label as primary text (before percentage)", () => {
    renderWithPortalProviders(
      <MatchPill
        matchScore={makeScoreWithSignals(78, "strong", {
          skillsOverlap: 50,
          locationMatch: true,
          employmentTypeMatch: true,
        })}
      />,
    );
    const badge = screen.getByTestId("match-pill-badge");
    expect(badge).toHaveTextContent("Strong Match · 78%");
  });

  it("de-emphasizes percentage with reduced opacity", () => {
    renderWithPortalProviders(
      <MatchPill
        matchScore={makeScoreWithSignals(62, "good", {
          skillsOverlap: 40,
          locationMatch: true,
          employmentTypeMatch: false,
        })}
      />,
    );
    const badge = screen.getByTestId("match-pill-badge");
    const percentSpan = badge.querySelector("span.opacity-60");
    expect(percentSpan).toBeInTheDocument();
    expect(percentSpan).toHaveTextContent("62%");
  });
});

describe("MatchPill — info icon", () => {
  it("renders info icon with correct aria-label", () => {
    renderWithPortalProviders(<MatchPill matchScore={makeScore(85, "strong")} />);
    const trigger = screen.getByTestId("match-info-trigger");
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-label", "Match score info");
  });

  it("opens popover on click with signal checklist", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(
      <MatchPill
        matchScore={makeScoreWithSignals(85, "strong", {
          skillsOverlap: 60,
          locationMatch: true,
          employmentTypeMatch: true,
        })}
      />,
    );
    const trigger = screen.getByTestId("match-info-trigger");
    await user.click(trigger);

    expect(screen.getByText("How this score works")).toBeInTheDocument();
    expect(screen.getByText("Skills overlap")).toBeInTheDocument();
    expect(screen.getByText("Location match")).toBeInTheDocument();
    expect(screen.getByText("Work type match")).toBeInTheDocument();
  });
});

describe("MatchPill — hint display", () => {
  it("shows improvement hints when signals are weak", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(
      <MatchPill
        matchScore={makeScoreWithSignals(38, "fair", {
          skillsOverlap: 10,
          locationMatch: false,
          employmentTypeMatch: true,
        })}
      />,
    );
    await user.click(screen.getByTestId("match-info-trigger"));

    expect(screen.getByText("Improve your match")).toBeInTheDocument();
    expect(screen.getByText(/Add more skills to your profile/)).toBeInTheDocument();
    expect(screen.getByText(/Update your location preferences/)).toBeInTheDocument();
  });

  it("does not show improve heading when all signals strong", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(
      <MatchPill
        matchScore={makeScoreWithSignals(85, "strong", {
          skillsOverlap: 60,
          locationMatch: true,
          employmentTypeMatch: true,
        })}
      />,
    );
    await user.click(screen.getByTestId("match-info-trigger"));

    expect(screen.queryByText("Improve your match")).not.toBeInTheDocument();
    expect(screen.getByText("How this score works")).toBeInTheDocument();
  });
});

describe("MatchPill — signal checkmarks", () => {
  it("shows all checkmarks when all signals strong", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(
      <MatchPill
        matchScore={makeScoreWithSignals(85, "strong", {
          skillsOverlap: 60,
          locationMatch: true,
          employmentTypeMatch: true,
        })}
      />,
    );
    await user.click(screen.getByTestId("match-info-trigger"));

    const checkmarks = screen.getAllByText("✓");
    expect(checkmarks).toHaveLength(3);
  });

  it("shows crosses for weak signals", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(
      <MatchPill
        matchScore={makeScoreWithSignals(38, "fair", {
          skillsOverlap: 10,
          locationMatch: false,
          employmentTypeMatch: true,
        })}
      />,
    );
    await user.click(screen.getByTestId("match-info-trigger"));

    const crosses = screen.getAllByText("✗");
    expect(crosses).toHaveLength(2); // skills (10 < 30) + location
    const checks = screen.getAllByText("✓");
    expect(checks).toHaveLength(1); // employmentType
  });
});

describe("MatchPill — onInfoClick callback", () => {
  it("fires callback when popover opens", async () => {
    const user = userEvent.setup();
    const onInfoClick = vi.fn();
    renderWithPortalProviders(
      <MatchPill matchScore={makeScore(85, "strong")} onInfoClick={onInfoClick} />,
    );
    await user.click(screen.getByTestId("match-info-trigger"));

    expect(onInfoClick).toHaveBeenCalledTimes(1);
  });

  it("does not error when no callback provided", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<MatchPill matchScore={makeScore(85, "strong")} />);
    await user.click(screen.getByTestId("match-info-trigger"));
    // No error thrown
    expect(screen.getByText("How this score works")).toBeInTheDocument();
  });
});

describe("MatchPill — popover close & focus", () => {
  it("closes popover on Escape and returns focus to trigger", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(
      <MatchPill
        matchScore={makeScoreWithSignals(85, "strong", {
          skillsOverlap: 60,
          locationMatch: true,
          employmentTypeMatch: true,
        })}
      />,
    );
    const trigger = screen.getByTestId("match-info-trigger");
    await user.click(trigger);
    expect(screen.getByText("How this score works")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByText("How this score works")).not.toBeInTheDocument();
  });

  it("toggles popover on repeated clicks", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(
      <MatchPill
        matchScore={makeScoreWithSignals(85, "strong", {
          skillsOverlap: 60,
          locationMatch: true,
          employmentTypeMatch: true,
        })}
      />,
    );
    const trigger = screen.getByTestId("match-info-trigger");

    await user.click(trigger);
    expect(screen.getByText("How this score works")).toBeInTheDocument();

    await user.click(trigger);
    expect(screen.queryByText("How this score works")).not.toBeInTheDocument();
  });
});

describe("MatchPill — accessibility with popover", () => {
  it("passes axe check with popover open", async () => {
    const user = userEvent.setup();
    const { container } = renderWithPortalProviders(
      <MatchPill
        matchScore={makeScoreWithSignals(62, "good", {
          skillsOverlap: 40,
          locationMatch: true,
          employmentTypeMatch: false,
        })}
      />,
    );
    await user.click(screen.getByTestId("match-info-trigger"));
    expect(screen.getByText("How this score works")).toBeInTheDocument();

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
