/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { renderWithPortalProviders, screen, within } from "@/test-utils/render";
import { ClosedApplicationsSection } from "./closed-applications-section";
import type { KanbanApplication } from "./candidate-card";

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

function makeApp(overrides: Partial<KanbanApplication>): KanbanApplication {
  return {
    id: "app-1",
    seekerUserId: "seeker-1",
    seekerName: "Ada Okafor",
    seekerHeadline: "Software Engineer",
    seekerProfileId: "sp-1",
    seekerSkills: [],
    status: "submitted",
    createdAt: new Date("2024-01-01"),
    coverLetterText: null,
    portfolioLinksJson: [],
    selectedCvId: null,
    ...overrides,
  };
}

const CLOSED_APPS: KanbanApplication[] = [
  makeApp({ id: "c-1", seekerName: "Hired Ada", status: "hired" }),
  makeApp({ id: "c-2", seekerName: "Rejected Bob", status: "rejected" }),
  makeApp({ id: "c-3", seekerName: "Withdrawn Chi", status: "withdrawn" }),
];

describe("ClosedApplicationsSection — rendering", () => {
  it("renders nothing when there are no closed applications", () => {
    const { container } = renderWithPortalProviders(
      <ClosedApplicationsSection applications={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when applications are all non-terminal", () => {
    const openApps = [
      makeApp({ id: "o-1", status: "submitted" }),
      makeApp({ id: "o-2", status: "under_review" }),
    ];
    const { container } = renderWithPortalProviders(
      <ClosedApplicationsSection applications={openApps} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the section when at least one terminal application exists", () => {
    renderWithPortalProviders(<ClosedApplicationsSection applications={CLOSED_APPS} />);
    expect(screen.getByTestId("closed-applications-section")).toBeInTheDocument();
  });

  it("shows the count in the trigger label", () => {
    renderWithPortalProviders(<ClosedApplicationsSection applications={CLOSED_APPS} />);
    expect(screen.getByText(/Show closed \(3\)/)).toBeInTheDocument();
  });

  it("is collapsed by default — cards are not visible", () => {
    renderWithPortalProviders(<ClosedApplicationsSection applications={CLOSED_APPS} />);
    expect(screen.queryByText("Hired Ada")).not.toBeInTheDocument();
  });

  it("filters out non-terminal applications defensively", () => {
    const mixed: KanbanApplication[] = [
      makeApp({ id: "o-1", seekerName: "Open One", status: "submitted" }),
      makeApp({ id: "c-1", seekerName: "Hired Ada", status: "hired" }),
    ];
    renderWithPortalProviders(<ClosedApplicationsSection applications={mixed} />);
    // "Show closed (1)" — only the hired app counts
    expect(screen.getByText(/Show closed \(1\)/)).toBeInTheDocument();
  });
});

describe("ClosedApplicationsSection — interaction", () => {
  it("expands on trigger click and shows all terminal cards", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<ClosedApplicationsSection applications={CLOSED_APPS} />);

    await user.click(screen.getByTestId("closed-applications-trigger"));

    expect(screen.getByText("Hired Ada")).toBeInTheDocument();
    expect(screen.getByText("Rejected Bob")).toBeInTheDocument();
    expect(screen.getByText("Withdrawn Chi")).toBeInTheDocument();
  });

  it("switches trigger label to 'Hide closed' when expanded", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<ClosedApplicationsSection applications={CLOSED_APPS} />);

    await user.click(screen.getByTestId("closed-applications-trigger"));
    expect(screen.getByText(/Hide closed/)).toBeInTheDocument();
  });

  it("renders a status badge inside each expanded card", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<ClosedApplicationsSection applications={CLOSED_APPS} />);

    await user.click(screen.getByTestId("closed-applications-trigger"));
    // ApplicationStatusBadge renders role="status" — 3 cards = 3 badges
    expect(screen.getAllByRole("status").length).toBe(3);
  });

  it("fires onCardClick when an expanded card is clicked", async () => {
    const onCardClick = vi.fn();
    const user = userEvent.setup();
    renderWithPortalProviders(
      <ClosedApplicationsSection applications={CLOSED_APPS} onCardClick={onCardClick} />,
    );

    await user.click(screen.getByTestId("closed-applications-trigger"));
    await user.click(screen.getByTestId("candidate-card-c-1"));
    expect(onCardClick).toHaveBeenCalledWith("c-1");
  });
});

describe("ClosedApplicationsSection — accessibility", () => {
  it("section list has aria-label from Portal.ats.closedSection", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<ClosedApplicationsSection applications={CLOSED_APPS} />);
    await user.click(screen.getByTestId("closed-applications-trigger"));
    const list = screen.getByRole("list", { name: /Closed/ });
    expect(list).toBeInTheDocument();
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
  });

  it("has no axe violations when collapsed", async () => {
    const { container } = renderWithPortalProviders(
      <ClosedApplicationsSection applications={CLOSED_APPS} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no axe violations when expanded", async () => {
    const user = userEvent.setup();
    const { container } = renderWithPortalProviders(
      <ClosedApplicationsSection applications={CLOSED_APPS} />,
    );
    await user.click(screen.getByTestId("closed-applications-trigger"));
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
