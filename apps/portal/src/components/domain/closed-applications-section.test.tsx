/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { renderWithPortalProviders, screen } from "@/test-utils/render";
import { ClosedApplicationsSection } from "./closed-applications-section";
import type { KanbanApplication } from "./ats-kanban-board";

expect.extend(toHaveNoViolations);

beforeAll(() => {
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTerminalApp(
  id: string,
  status: "hired" | "rejected" | "withdrawn",
): KanbanApplication {
  return {
    id,
    seekerName: `Person ${id}`,
    seekerHeadline: null,
    status,
    seekerProfileId: null,
    seekerSkills: [],
    createdAt: new Date("2024-01-01"),
    coverLetterText: null,
    portfolioLinksJson: [],
    selectedCvId: null,
  };
}

const TERMINAL_APPS: KanbanApplication[] = [
  makeTerminalApp("t-1", "hired"),
  makeTerminalApp("t-2", "rejected"),
  makeTerminalApp("t-3", "withdrawn"),
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ClosedApplicationsSection", () => {
  it("renders nothing when applications array is empty", () => {
    renderWithPortalProviders(<ClosedApplicationsSection applications={[]} />);
    expect(screen.queryByTestId("closed-applications-section")).not.toBeInTheDocument();
  });

  it("renders collapsed by default", () => {
    renderWithPortalProviders(<ClosedApplicationsSection applications={TERMINAL_APPS} />);
    expect(screen.queryByTestId("closed-apps-list")).not.toBeInTheDocument();
  });

  it("shows expand button with correct count", () => {
    renderWithPortalProviders(<ClosedApplicationsSection applications={TERMINAL_APPS} />);
    const toggle = screen.getByTestId("closed-toggle");
    expect(toggle).toHaveTextContent("3");
  });

  it("expands to show cards when toggle is clicked", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<ClosedApplicationsSection applications={TERMINAL_APPS} />);

    const toggle = screen.getByTestId("closed-toggle");
    await user.click(toggle);

    expect(screen.getByTestId("closed-apps-list")).toBeInTheDocument();
    expect(screen.getByText("Person t-1")).toBeInTheDocument();
    expect(screen.getByText("Person t-2")).toBeInTheDocument();
    expect(screen.getByText("Person t-3")).toBeInTheDocument();
  });

  it("collapses again when toggle is clicked a second time", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<ClosedApplicationsSection applications={TERMINAL_APPS} />);

    const toggle = screen.getByTestId("closed-toggle");
    await user.click(toggle);
    expect(screen.getByTestId("closed-apps-list")).toBeInTheDocument();

    await user.click(toggle);
    expect(screen.queryByTestId("closed-apps-list")).not.toBeInTheDocument();
  });

  it("toggle button aria-expanded reflects open state", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<ClosedApplicationsSection applications={TERMINAL_APPS} />);

    const toggle = screen.getByTestId("closed-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("shows 'Closed' heading", () => {
    renderWithPortalProviders(<ClosedApplicationsSection applications={TERMINAL_APPS} />);
    expect(screen.getByText("Closed")).toBeInTheDocument();
  });

  it("calls onCardClick when a closed card is clicked", async () => {
    const user = userEvent.setup();
    const onCardClick = vi.fn();
    renderWithPortalProviders(
      <ClosedApplicationsSection applications={TERMINAL_APPS} onCardClick={onCardClick} />,
    );

    const toggle = screen.getByTestId("closed-toggle");
    await user.click(toggle);

    const card = screen.getByTestId("candidate-card-t-1");
    await user.click(card);
    expect(onCardClick).toHaveBeenCalledWith("t-1");
  });

  it("has no axe violations when expanded", async () => {
    const user = userEvent.setup();
    const { container } = renderWithPortalProviders(
      <ClosedApplicationsSection applications={TERMINAL_APPS} />,
    );

    const toggle = screen.getByTestId("closed-toggle");
    await user.click(toggle);

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
