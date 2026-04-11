/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderWithPortalProviders, screen } from "@/test-utils/render";
import { AtsPipelineView } from "./ats-pipeline-view";
import type { KanbanApplication } from "@/components/domain/candidate-card";

// Mock sonner toast (kanban board uses it)
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

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

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({
      data: {
        application: {
          id: "app-1",
          jobId: "job-1",
          seekerUserId: "user-1",
          status: "submitted",
          createdAt: new Date("2024-03-15").toISOString(),
          updatedAt: new Date("2024-03-15").toISOString(),
          coverLetterText: null,
          portfolioLinksJson: [],
          selectedCvId: null,
          jobTitle: "Senior",
          seekerName: "Ada Okafor",
          seekerHeadline: "Software Engineer",
          seekerProfileId: "sp-1",
          seekerSummary: null,
          seekerSkills: [],
          cvId: null,
          cvLabel: null,
          cvProcessedUrl: null,
        },
        trustSignals: null,
        transitions: [],
      },
    }),
  }) as unknown as typeof fetch;
});

function makeApp(overrides: Partial<KanbanApplication>): KanbanApplication {
  return {
    id: "app-default",
    seekerUserId: "seeker-default",
    seekerName: "Ada Okafor",
    seekerHeadline: "Software Engineer",
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

const MIXED_APPS: KanbanApplication[] = [
  makeApp({ id: "app-1", seekerName: "Open Ada", status: "submitted" }),
  makeApp({ id: "app-2", seekerName: "Open Bob", status: "under_review" }),
  makeApp({ id: "app-3", seekerName: "Closed Chi", status: "hired" }),
  makeApp({ id: "app-4", seekerName: "Closed Dee", status: "rejected" }),
];

describe("AtsPipelineView — empty state", () => {
  it("renders empty state when no applications provided", () => {
    renderWithPortalProviders(<AtsPipelineView applications={[]} />);
    expect(screen.getByTestId("ats-pipeline-empty")).toBeInTheDocument();
    expect(screen.getByText(/No applications yet/)).toBeInTheDocument();
  });

  it("does not render the kanban board when empty", () => {
    renderWithPortalProviders(<AtsPipelineView applications={[]} />);
    expect(screen.queryByTestId("ats-kanban-board")).not.toBeInTheDocument();
  });
});

describe("AtsPipelineView — with applications", () => {
  it("renders kanban board when applications exist", () => {
    renderWithPortalProviders(<AtsPipelineView applications={MIXED_APPS} />);
    expect(screen.getByTestId("ats-kanban-board")).toBeInTheDocument();
  });

  it("passes only non-terminal apps to kanban board", () => {
    renderWithPortalProviders(<AtsPipelineView applications={MIXED_APPS} />);
    // Non-terminal cards appear on the board
    expect(screen.getByText("Open Ada")).toBeInTheDocument();
    expect(screen.getByText("Open Bob")).toBeInTheDocument();
    // Terminal apps are in the collapsed ClosedApplicationsSection
    expect(screen.queryByText("Closed Chi")).not.toBeInTheDocument();
    expect(screen.queryByText("Closed Dee")).not.toBeInTheDocument();
  });

  it("renders the ClosedApplicationsSection when terminal apps exist", () => {
    renderWithPortalProviders(<AtsPipelineView applications={MIXED_APPS} />);
    expect(screen.getByTestId("closed-applications-section")).toBeInTheDocument();
  });

  it("does not render ClosedApplicationsSection when no terminal apps", () => {
    const openOnly: KanbanApplication[] = [makeApp({ id: "o-1", status: "submitted" })];
    renderWithPortalProviders(<AtsPipelineView applications={openOnly} />);
    expect(screen.queryByTestId("closed-applications-section")).not.toBeInTheDocument();
  });
});

describe("AtsPipelineView — side panel interaction", () => {
  it("opens CandidateSidePanel when a card is clicked", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<AtsPipelineView applications={MIXED_APPS} />);

    // Side panel initially closed
    expect(screen.queryByTestId("candidate-side-panel")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("candidate-card-app-1"));

    // Side panel should open and fetch detail
    expect(await screen.findByTestId("candidate-side-panel")).toBeInTheDocument();
  });

  it("opens side panel when closed-section card is clicked (after expand)", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<AtsPipelineView applications={MIXED_APPS} />);

    await user.click(screen.getByTestId("closed-applications-trigger"));
    expect(screen.getByText("Closed Chi")).toBeInTheDocument();

    await user.click(screen.getByTestId("candidate-card-app-3"));
    expect(await screen.findByTestId("candidate-side-panel")).toBeInTheDocument();
  });
});
