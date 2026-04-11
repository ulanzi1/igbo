/**
 * @vitest-environment jsdom
 *
 * ATS Kanban Board tests (P-2.9 evolved from SPIKE-2).
 *
 * SPIKE-2 finding: jsdom cannot reliably simulate @dnd-kit drag gestures
 * (PointerSensor requires getBoundingClientRect which jsdom returns 0 for).
 * Unit tests cover: rendering, isValidDrop logic, a11y, API integration
 * (mocked fetch), error handling. Real DnD gesture tests live in Playwright.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
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
} from "./ats-kanban-board";
import type { KanbanApplication } from "./candidate-card";

expect.extend(toHaveNoViolations);

// ---------------------------------------------------------------------------
// jsdom polyfills — required for @dnd-kit (uses pointer capture, scrollIntoView)
// and Radix ScrollArea (ResizeObserver).
// ---------------------------------------------------------------------------
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
// Test fixtures (expanded shape: seekerName, seekerHeadline, seekerSkills, etc.)
// ---------------------------------------------------------------------------
function makeApp(overrides: Partial<KanbanApplication>): KanbanApplication {
  return {
    id: "app-default",
    seekerUserId: "seeker-default",
    seekerName: "Default Seeker",
    seekerHeadline: "Default Headline",
    seekerProfileId: "sp-default",
    seekerSkills: [],
    status: "submitted",
    createdAt: new Date("2024-01-01"),
    coverLetterText: null,
    portfolioLinksJson: [],
    selectedCvId: null,
    ...overrides,
  };
}

const MOCK_APPLICATIONS: KanbanApplication[] = [
  makeApp({
    id: "app-1",
    seekerName: "Ada Okafor",
    seekerHeadline: "Software Engineer",
    status: "submitted",
  }),
  makeApp({
    id: "app-2",
    seekerName: "Chidi Eze",
    seekerHeadline: "Product Designer",
    status: "under_review",
  }),
  makeApp({
    id: "app-3",
    seekerName: "Ngozi Nwosu",
    seekerHeadline: "DevOps Lead",
    status: "shortlisted",
  }),
  makeApp({
    id: "app-4",
    seekerName: "Emeka Udo",
    seekerHeadline: "Frontend Dev",
    status: "submitted",
  }),
  makeApp({
    id: "app-5",
    seekerName: "Ifeoma Obi",
    seekerHeadline: "Data Analyst",
    status: "interview",
  }),
];

// Mock sonner toast for integration tests
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it("renders the board region with Portal.ats.ariaBoard label", () => {
    renderWithPortalProviders(<AtsKanbanBoard applications={MOCK_APPLICATIONS} />);

    const board = screen.getByTestId("ats-kanban-board");
    expect(board).toHaveAttribute("role", "region");
    expect(board).toHaveAttribute("aria-label", "Candidate pipeline board");
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

  it("renders column count badges via Portal.ats.columnCount", () => {
    renderWithPortalProviders(<AtsKanbanBoard applications={MOCK_APPLICATIONS} />);

    const submittedCol = screen.getByTestId("kanban-column-submitted");
    // 2 apps in submitted — the column's aria-labeled badge renders "2"
    const badge = within(submittedCol).getByLabelText(/Submitted column, 2/);
    expect(badge).toHaveTextContent("2");
  });

  it("renders cards with seeker name and headline (no jobTitle)", () => {
    renderWithPortalProviders(<AtsKanbanBoard applications={MOCK_APPLICATIONS} />);

    const card = screen.getByTestId("candidate-card-app-1");
    expect(within(card).getByText("Ada Okafor")).toBeInTheDocument();
    expect(within(card).getByText("Software Engineer")).toBeInTheDocument();
  });

  it("renders cards with candidate card testid", () => {
    renderWithPortalProviders(<AtsKanbanBoard applications={MOCK_APPLICATIONS} />);
    expect(screen.getByTestId("candidate-card-app-1")).toBeInTheDocument();
  });

  it("renders empty columns without errors", () => {
    renderWithPortalProviders(<AtsKanbanBoard applications={[]} />);

    expect(screen.getByTestId("kanban-column-submitted")).toBeInTheDocument();
    expect(screen.getByTestId("kanban-column-offered")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 2. TRANSITION LOGIC UNIT TESTS
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
// 3. DRIFT-GUARD: EMPLOYER_TRANSITIONS vs server VALID_TRANSITIONS
// ---------------------------------------------------------------------------
describe("AtsKanbanBoard — Drift Guard", () => {
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
// 4. TERMINAL STATE EXCLUSION
// ---------------------------------------------------------------------------
describe("AtsKanbanBoard — Terminal State Exclusion", () => {
  it("terminal state cards (hired/rejected/withdrawn) do not appear on board", () => {
    const terminalApps: KanbanApplication[] = [
      makeApp({ id: "t-1", seekerName: "Hired Person", status: "hired" }),
      makeApp({ id: "t-2", seekerName: "Rejected Person", status: "rejected" }),
      makeApp({ id: "t-3", seekerName: "Withdrawn Person", status: "withdrawn" }),
    ];

    renderWithPortalProviders(<AtsKanbanBoard applications={terminalApps} />);

    expect(screen.queryByText("Hired Person")).not.toBeInTheDocument();
    expect(screen.queryByText("Rejected Person")).not.toBeInTheDocument();
    expect(screen.queryByText("Withdrawn Person")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 5. KEYBOARD ACCESSIBILITY
// ---------------------------------------------------------------------------
describe("AtsKanbanBoard — Keyboard Accessibility", () => {
  it("cards have tabindex=0 for keyboard focus", () => {
    renderWithPortalProviders(<AtsKanbanBoard applications={MOCK_APPLICATIONS} />);
    const card = screen.getByTestId("candidate-card-app-1");
    expect(card).toHaveAttribute("tabindex", "0");
  });

  it("cards have role=listitem for screen readers", () => {
    renderWithPortalProviders(<AtsKanbanBoard applications={MOCK_APPLICATIONS} />);
    const card = screen.getByTestId("candidate-card-app-1");
    expect(card).toHaveAttribute("role", "listitem");
  });

  it("columns contain a list element labelled by the column header", () => {
    renderWithPortalProviders(<AtsKanbanBoard applications={MOCK_APPLICATIONS} />);
    const col = screen.getByTestId("kanban-column-submitted");
    const list = within(col).getByRole("list");
    expect(list).toHaveAttribute("aria-labelledby", "kanban-col-list-submitted");
  });
});

// ---------------------------------------------------------------------------
// 6. POINTER SENSOR
// ---------------------------------------------------------------------------
describe("AtsKanbanBoard — Pointer Sensor", () => {
  it("stationary pointer down+up does not trigger onStatusChange", () => {
    const onStatusChange = vi.fn().mockResolvedValue(undefined);
    renderWithPortalProviders(
      <AtsKanbanBoard applications={MOCK_APPLICATIONS} onStatusChange={onStatusChange} />,
    );

    const card = screen.getByTestId("candidate-card-app-1");
    fireEvent.pointerDown(card, { pointerId: 1 });
    fireEvent.pointerUp(card, { pointerId: 1 });
    expect(onStatusChange).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 7. onCardClick — opens side panel
// ---------------------------------------------------------------------------
describe("AtsKanbanBoard — onCardClick", () => {
  it("fires onCardClick when a card is clicked", async () => {
    const onCardClick = vi.fn();
    const user = userEvent.setup();
    renderWithPortalProviders(
      <AtsKanbanBoard applications={MOCK_APPLICATIONS} onCardClick={onCardClick} />,
    );

    await user.click(screen.getByTestId("candidate-card-app-1"));
    expect(onCardClick).toHaveBeenCalledWith("app-1");
  });

  it("fires onCardClick when a card is activated by Enter", async () => {
    const onCardClick = vi.fn();
    const user = userEvent.setup();
    renderWithPortalProviders(
      <AtsKanbanBoard applications={MOCK_APPLICATIONS} onCardClick={onCardClick} />,
    );

    const card = screen.getByTestId("candidate-card-app-1");
    card.focus();
    await user.keyboard("{Enter}");
    expect(onCardClick).toHaveBeenCalledWith("app-1");
  });
});

// ---------------------------------------------------------------------------
// 8. API integration — defaultStatusChange & external state sync
// ---------------------------------------------------------------------------
describe("AtsKanbanBoard — API integration", () => {
  it("renders without errors when no onStatusChange prop is provided (defaultStatusChange path)", () => {
    // C-1: DnD gesture simulation unavailable in jsdom (no getBoundingClientRect).
    // The defaultStatusChange function is wired to PATCH /api/v1/applications/[id]/status;
    // that full path is verified in status/route.test.ts and Playwright E2E.
    // This smoke test confirms the board renders correctly with the default path active.
    renderWithPortalProviders(<AtsKanbanBoard applications={MOCK_APPLICATIONS} />);
    expect(screen.getByTestId("ats-kanban-board")).toBeInTheDocument();
    // Board must NOT call fetch on mount — only on completed drags
  });

  it("does not call onStatusChange on mount — only on drag completion", () => {
    const onStatusChange = vi.fn().mockResolvedValue(undefined);
    renderWithPortalProviders(
      <AtsKanbanBoard applications={MOCK_APPLICATIONS} onStatusChange={onStatusChange} />,
    );
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it("syncs board state when initialApps prop changes (useEffect reset path)", () => {
    // This tests the useEffect(() => setApplications(initialApps), [initialApps]) path.
    // Simulates a parent refetch after a successful server-side transition.
    const initialApps = [makeApp({ id: "app-1", status: "submitted" })];
    const { rerender } = renderWithPortalProviders(<AtsKanbanBoard applications={initialApps} />);

    const submittedCol = screen.getByTestId("kanban-column-submitted");
    expect(within(submittedCol).getByTestId("candidate-card-app-1")).toBeInTheDocument();

    // Parent passes updated applications after server-side transition
    const updatedApps = [makeApp({ id: "app-1", status: "under_review" })];
    rerender(<AtsKanbanBoard applications={updatedApps} />);

    const reviewCol = screen.getByTestId("kanban-column-under_review");
    expect(within(reviewCol).getByTestId("candidate-card-app-1")).toBeInTheDocument();
    expect(within(submittedCol).queryByTestId("candidate-card-app-1")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 9. ACCESSIBILITY AUDIT
// ---------------------------------------------------------------------------
describe("AtsKanbanBoard — Accessibility", () => {
  it("has no axe violations with populated board", async () => {
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

// ---------------------------------------------------------------------------
// 10. DragCancel handler
// ---------------------------------------------------------------------------
describe("AtsKanbanBoard — DragCancel", () => {
  it("renders without crashing when cancellation handler is wired", () => {
    renderWithPortalProviders(<AtsKanbanBoard applications={MOCK_APPLICATIONS} />);
    // Cancel handling is internal; we verify it's wired by code inspection + no-crash
    expect(screen.getByTestId("ats-kanban-board")).toBeInTheDocument();
  });
});
