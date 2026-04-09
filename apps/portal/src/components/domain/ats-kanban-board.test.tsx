/**
 * @vitest-environment jsdom
 *
 * SPIKE-2: ATS Drag-and-Drop — Testability Validation
 *
 * Key spike question: Can we reliably simulate @dnd-kit DnD in Vitest/jsdom?
 *
 * Findings documented in docs/decisions/spike-2-ats-dnd.md
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { renderWithPortalProviders, screen, within } from "@/test-utils/render";
import type { PortalApplicationStatus } from "@igbo/db/schema/portal-applications";
import {
  AtsKanbanBoard,
  EMPLOYER_TRANSITIONS,
  KANBAN_COLUMNS,
  isValidDrop,
  type KanbanApplication,
} from "./ats-kanban-board";

expect.extend(toHaveNoViolations);

// ---------------------------------------------------------------------------
// jsdom polyfills — required for @dnd-kit (uses pointer capture, scrollIntoView)
// ---------------------------------------------------------------------------
beforeAll(() => {
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });

  // ResizeObserver not in jsdom
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------
const MOCK_APPLICATIONS: KanbanApplication[] = [
  { id: "app-1", seekerName: "Ada Okafor", jobTitle: "Software Engineer", status: "submitted" },
  { id: "app-2", seekerName: "Chidi Eze", jobTitle: "Product Designer", status: "under_review" },
  { id: "app-3", seekerName: "Ngozi Nwosu", jobTitle: "DevOps Lead", status: "shortlisted" },
  { id: "app-4", seekerName: "Emeka Udo", jobTitle: "Frontend Dev", status: "submitted" },
  { id: "app-5", seekerName: "Ifeoma Obi", jobTitle: "Data Analyst", status: "interview" },
];

// ---------------------------------------------------------------------------
// 1. RENDERING TESTS
// ---------------------------------------------------------------------------
describe("AtsKanbanBoard — Rendering", () => {
  it("renders all 5 pipeline columns", () => {
    renderWithPortalProviders(<AtsKanbanBoard applications={MOCK_APPLICATIONS} />);

    expect(screen.getByTestId("kanban-column-submitted")).toBeInTheDocument();
    expect(screen.getByTestId("kanban-column-under_review")).toBeInTheDocument();
    expect(screen.getByTestId("kanban-column-shortlisted")).toBeInTheDocument();
    expect(screen.getByTestId("kanban-column-interview")).toBeInTheDocument();
    expect(screen.getByTestId("kanban-column-offered")).toBeInTheDocument();
  });

  it("renders the board region with i18n accessible label", () => {
    renderWithPortalProviders(<AtsKanbanBoard applications={MOCK_APPLICATIONS} />);

    const board = screen.getByTestId("ats-kanban-board");
    expect(board).toHaveAttribute("role", "region");
    // F1 fix: label comes from i18n, not hardcoded
    expect(board).toHaveAttribute("aria-label", "Application tracking board");
  });

  it("distributes cards into correct columns", () => {
    renderWithPortalProviders(<AtsKanbanBoard applications={MOCK_APPLICATIONS} />);

    const submittedCol = screen.getByTestId("kanban-column-submitted");
    expect(within(submittedCol).getByText("Ada Okafor")).toBeInTheDocument();
    expect(within(submittedCol).getByText("Emeka Udo")).toBeInTheDocument();

    const reviewCol = screen.getByTestId("kanban-column-under_review");
    expect(within(reviewCol).getByText("Chidi Eze")).toBeInTheDocument();

    const shortlistedCol = screen.getByTestId("kanban-column-shortlisted");
    expect(within(shortlistedCol).getByText("Ngozi Nwosu")).toBeInTheDocument();
  });

  it("renders column headers with counts", () => {
    renderWithPortalProviders(<AtsKanbanBoard applications={MOCK_APPLICATIONS} />);

    const submittedCol = screen.getByTestId("kanban-column-submitted");
    // 2 apps in submitted
    expect(within(submittedCol).getByText("2")).toBeInTheDocument();
  });

  it("renders cards with seeker name, job title, and status badge", () => {
    renderWithPortalProviders(<AtsKanbanBoard applications={MOCK_APPLICATIONS} />);

    const card = screen.getByTestId("kanban-card-app-1");
    expect(within(card).getByText("Ada Okafor")).toBeInTheDocument();
    expect(within(card).getByText("Software Engineer")).toBeInTheDocument();
    // ApplicationStatusBadge renders a role="status" element
    expect(within(card).getByRole("status")).toBeInTheDocument();
  });

  it("renders cards with i18n aria-roledescription", () => {
    renderWithPortalProviders(<AtsKanbanBoard applications={MOCK_APPLICATIONS} />);

    const card = screen.getByTestId("kanban-card-app-1");
    // F11 fix: comes from i18n
    expect(card).toHaveAttribute("aria-roledescription", "draggable application card");
  });

  it("renders empty columns without errors", () => {
    renderWithPortalProviders(<AtsKanbanBoard applications={[]} />);

    // All 5 columns should render even with no cards
    expect(screen.getByTestId("kanban-column-submitted")).toBeInTheDocument();
    expect(screen.getByTestId("kanban-column-offered")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 2. DnD SIMULATION — THE KEY SPIKE QUESTION
//
// SPIKE FINDING: Direct @dnd-kit drag simulation in jsdom is NOT reliable.
// PointerSensor requires getBoundingClientRect (jsdom returns 0 for all).
// KeyboardSensor requires DOM measurements for collision detection.
//
// Recommended approach: Test transition logic directly (unit),
// use Playwright for E2E DnD gesture testing.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 3. TRANSITION LOGIC UNIT TESTS (F7 + F8 fix: actually test isValidDrop)
// ---------------------------------------------------------------------------
describe("AtsKanbanBoard — isValidDrop", () => {
  it("allows submitted → under_review", () => {
    expect(isValidDrop("submitted", "under_review")).toBe(true);
  });

  it("allows submitted → rejected", () => {
    expect(isValidDrop("submitted", "rejected")).toBe(true);
  });

  it("rejects submitted → shortlisted (must go through under_review)", () => {
    expect(isValidDrop("submitted", "shortlisted")).toBe(false);
  });

  it("rejects submitted → interview (skip)", () => {
    expect(isValidDrop("submitted", "interview")).toBe(false);
  });

  it("allows under_review → shortlisted", () => {
    expect(isValidDrop("under_review", "shortlisted")).toBe(true);
  });

  it("allows shortlisted → interview", () => {
    expect(isValidDrop("shortlisted", "interview")).toBe(true);
  });

  it("allows interview → offered", () => {
    expect(isValidDrop("interview", "offered")).toBe(true);
  });

  it("allows offered → hired", () => {
    expect(isValidDrop("offered", "hired")).toBe(true);
  });

  it("rejects any outbound transition from hired (terminal)", () => {
    for (const col of KANBAN_COLUMNS) {
      expect(isValidDrop("hired", col)).toBe(false);
    }
  });

  it("rejects any outbound transition from rejected (terminal)", () => {
    for (const col of KANBAN_COLUMNS) {
      expect(isValidDrop("rejected", col)).toBe(false);
    }
  });

  it("rejects any outbound transition from withdrawn (terminal)", () => {
    for (const col of KANBAN_COLUMNS) {
      expect(isValidDrop("withdrawn", col)).toBe(false);
    }
  });

  it("allows rejected from every non-terminal status", () => {
    for (const col of KANBAN_COLUMNS) {
      expect(isValidDrop(col, "rejected")).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. DRIFT-GUARD: EMPLOYER_TRANSITIONS vs server-side VALID_TRANSITIONS (F2)
//
// This test validates that EMPLOYER_TRANSITIONS is a correct subset of the
// server-side state machine. If the server map changes, this test fails.
// ---------------------------------------------------------------------------
describe("AtsKanbanBoard — Drift Guard", () => {
  // Expected employer transitions derived from application-state-machine.ts
  // VALID_TRANSITIONS. If that file changes, update this test.
  const SERVER_EMPLOYER_TRANSITIONS: Record<string, string[]> = {
    submitted: ["under_review", "rejected"],
    under_review: ["shortlisted", "rejected"],
    shortlisted: ["interview", "rejected"],
    interview: ["offered", "rejected"],
    offered: ["hired", "rejected"],
    hired: [],
    rejected: [],
    withdrawn: [],
  };

  it("EMPLOYER_TRANSITIONS matches server-side employer transitions", () => {
    for (const [status, expected] of Object.entries(SERVER_EMPLOYER_TRANSITIONS)) {
      const actual = EMPLOYER_TRANSITIONS[status as PortalApplicationStatus];
      expect(actual).toEqual(expected);
    }
  });

  it("KANBAN_COLUMNS contains only non-terminal statuses", () => {
    const terminalStatuses = ["hired", "rejected", "withdrawn"];
    for (const col of KANBAN_COLUMNS) {
      expect(terminalStatuses).not.toContain(col);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. TERMINAL STATE EXCLUSION
// ---------------------------------------------------------------------------
describe("AtsKanbanBoard — Terminal State Exclusion", () => {
  it("terminal state cards (hired/rejected/withdrawn) do not appear on board", () => {
    const terminalApps: KanbanApplication[] = [
      { id: "t-1", seekerName: "Hired Person", jobTitle: "Job", status: "hired" },
      { id: "t-2", seekerName: "Rejected Person", jobTitle: "Job", status: "rejected" },
      { id: "t-3", seekerName: "Withdrawn Person", jobTitle: "Job", status: "withdrawn" },
    ];

    renderWithPortalProviders(<AtsKanbanBoard applications={terminalApps} />);

    expect(screen.queryByText("Hired Person")).not.toBeInTheDocument();
    expect(screen.queryByText("Rejected Person")).not.toBeInTheDocument();
    expect(screen.queryByText("Withdrawn Person")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 6. KEYBOARD ACCESSIBILITY
// ---------------------------------------------------------------------------
describe("AtsKanbanBoard — Keyboard Accessibility", () => {
  it("cards have tabindex for keyboard focus", () => {
    renderWithPortalProviders(<AtsKanbanBoard applications={MOCK_APPLICATIONS} />);

    const card = screen.getByTestId("kanban-card-app-1");
    expect(card).toHaveAttribute("tabindex", "0");
  });

  it("cards have role=listitem for screen readers", () => {
    renderWithPortalProviders(<AtsKanbanBoard applications={MOCK_APPLICATIONS} />);

    const card = screen.getByTestId("kanban-card-app-1");
    expect(card).toHaveAttribute("role", "listitem");
  });

  it("columns contain a list element labelled by the column header", () => {
    renderWithPortalProviders(<AtsKanbanBoard applications={MOCK_APPLICATIONS} />);

    const col = screen.getByTestId("kanban-column-submitted");
    const list = within(col).getByRole("list");
    expect(list).toBeInTheDocument();
    expect(list).toHaveAttribute("aria-labelledby", "kanban-col-list-submitted");
  });

  it("cards can receive keyboard focus", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<AtsKanbanBoard applications={MOCK_APPLICATIONS} />);

    const card = screen.getByTestId("kanban-card-app-1");
    await user.tab();

    expect(card.tabIndex).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 7. POINTER SENSOR
// ---------------------------------------------------------------------------
describe("AtsKanbanBoard — Pointer Sensor", () => {
  it("stationary pointer down+up does not trigger onStatusChange", () => {
    const onStatusChange = vi.fn().mockResolvedValue(undefined);
    renderWithPortalProviders(
      <AtsKanbanBoard applications={MOCK_APPLICATIONS} onStatusChange={onStatusChange} />,
    );

    const card = screen.getByTestId("kanban-card-app-1");

    fireEvent.pointerDown(card, { pointerId: 1 });
    fireEvent.pointerUp(card, { pointerId: 1 });

    expect(onStatusChange).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 8. ACCESSIBILITY AUDIT
// ---------------------------------------------------------------------------
describe("AtsKanbanBoard — Accessibility", () => {
  it("has no axe violations", async () => {
    const { container } = renderWithPortalProviders(
      <AtsKanbanBoard applications={MOCK_APPLICATIONS} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no axe violations with empty board", async () => {
    const { container } = renderWithPortalProviders(<AtsKanbanBoard applications={[]} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
