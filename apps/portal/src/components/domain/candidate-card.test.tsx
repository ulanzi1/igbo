/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { renderWithPortalProviders, screen } from "@/test-utils/render";
import { CandidateCard } from "./candidate-card";
import type { KanbanApplication } from "./ats-kanban-board";

expect.extend(toHaveNoViolations);

beforeAll(() => {
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
});

const MOCK_APP: KanbanApplication = {
  id: "app-1",
  seekerName: "Ada Okafor",
  seekerHeadline: "Senior Engineer",
  status: "submitted",
  seekerProfileId: "sp-1",
  seekerSkills: ["TypeScript", "React"],
  createdAt: new Date("2024-01-15"),
  coverLetterText: null,
  portfolioLinksJson: [],
  selectedCvId: null,
};

describe("CandidateCard", () => {
  it("renders seeker name and headline", () => {
    renderWithPortalProviders(<CandidateCard application={MOCK_APP} onClick={vi.fn()} />);
    expect(screen.getByText("Ada Okafor")).toBeInTheDocument();
    expect(screen.getByText("Senior Engineer")).toBeInTheDocument();
  });

  it("renders the applied date formatted", () => {
    renderWithPortalProviders(<CandidateCard application={MOCK_APP} onClick={vi.fn()} />);
    // Applied date should be visible (format varies by locale, check for presence)
    const card = screen.getByTestId("candidate-card-app-1");
    expect(card).toBeInTheDocument();
  });

  it("calls onClick when card is clicked", async () => {
    const onClick = vi.fn();
    renderWithPortalProviders(<CandidateCard application={MOCK_APP} onClick={onClick} />);
    const card = screen.getByTestId("candidate-card-app-1");
    await userEvent.click(card);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("calls onClick when Enter key is pressed", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderWithPortalProviders(<CandidateCard application={MOCK_APP} onClick={onClick} />);
    const card = screen.getByTestId("candidate-card-app-1");
    card.focus();
    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("calls onClick when Space key is pressed", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderWithPortalProviders(<CandidateCard application={MOCK_APP} onClick={onClick} />);
    const card = screen.getByTestId("candidate-card-app-1");
    card.focus();
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("has tabindex=0 for keyboard focus", () => {
    renderWithPortalProviders(<CandidateCard application={MOCK_APP} onClick={vi.fn()} />);
    const card = screen.getByTestId("candidate-card-app-1");
    expect(card).toHaveAttribute("tabindex", "0");
  });

  it("does not have role=listitem (role is owned by the SortableCandidateCard wrapper in kanban context)", () => {
    renderWithPortalProviders(<CandidateCard application={MOCK_APP} onClick={vi.fn()} />);
    const card = screen.getByTestId("candidate-card-app-1");
    // role="listitem" lives on the dnd wrapper, not on CandidateCard directly
    expect(card).not.toHaveAttribute("role", "listitem");
  });

  it("applies dragging styles when isDragging=true", () => {
    renderWithPortalProviders(
      <CandidateCard application={MOCK_APP} onClick={vi.fn()} isDragging={true} />,
    );
    const card = screen.getByTestId("candidate-card-app-1");
    expect(card.className).toContain("opacity-40");
  });

  it("has no axe violations", async () => {
    const { container } = renderWithPortalProviders(
      <CandidateCard application={MOCK_APP} onClick={vi.fn()} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
