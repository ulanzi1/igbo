/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderWithPortalProviders, screen, waitFor } from "@/test-utils/render";
import { AtsPipelineView } from "./ats-pipeline-view";
import type { KanbanApplication } from "@/components/domain/ats-kanban-board";

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

function makeApp(id: string, status: KanbanApplication["status"]): KanbanApplication {
  return {
    id,
    seekerName: `Seeker ${id}`,
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

const ACTIVE_APPS: KanbanApplication[] = [
  makeApp("a-1", "submitted"),
  makeApp("a-2", "under_review"),
];

const CLOSED_APPS: KanbanApplication[] = [makeApp("c-1", "rejected"), makeApp("c-2", "hired")];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AtsPipelineView", () => {
  it("renders the kanban board", () => {
    renderWithPortalProviders(<AtsPipelineView applications={ACTIVE_APPS} />);
    expect(screen.getByTestId("ats-kanban-board")).toBeInTheDocument();
  });

  it("separates active and terminal applications", () => {
    renderWithPortalProviders(<AtsPipelineView applications={[...ACTIVE_APPS, ...CLOSED_APPS]} />);

    // Active apps appear on the board
    expect(screen.getByTestId("kanban-card-a-1")).toBeInTheDocument();
    expect(screen.getByTestId("kanban-card-a-2")).toBeInTheDocument();

    // Closed apps are in the closed section (collapsed by default, but toggle exists)
    expect(screen.getByTestId("closed-applications-section")).toBeInTheDocument();
    expect(screen.queryByTestId("kanban-card-c-1")).not.toBeInTheDocument();
  });

  it("does not render closed section when no terminal apps", () => {
    renderWithPortalProviders(<AtsPipelineView applications={ACTIVE_APPS} />);
    expect(screen.queryByTestId("closed-applications-section")).not.toBeInTheDocument();
  });

  it("opens side panel when a card is clicked", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          application: {
            id: "a-1",
            seekerName: "Seeker a-1",
            seekerHeadline: null,
            seekerSkills: [],
            seekerSummary: null,
            coverLetterText: null,
            portfolioLinksJson: [],
            cvLabel: null,
            cvProcessedUrl: null,
          },
          trustSignals: {
            isVerified: false,
            badgeType: null,
            memberSince: null,
            memberDurationDays: 0,
            communityPoints: 0,
            engagementLevel: "low" as const,
            displayName: "Seeker",
          },
          transitions: [],
        },
      }),
    } as Response);

    renderWithPortalProviders(<AtsPipelineView applications={ACTIVE_APPS} />);

    // Side panel should not be open initially
    expect(screen.queryByTestId("candidate-side-panel")).not.toBeInTheDocument();

    // Click the CandidateCard (inner element)
    const card = screen.getByTestId("candidate-card-a-1");
    await userEvent.click(card);

    // Side panel should now be open
    await waitFor(() => {
      expect(screen.getByTestId("candidate-side-panel")).toBeInTheDocument();
    });

    vi.restoreAllMocks();
  });

  it("passes all applications to kanban board and closed section", () => {
    renderWithPortalProviders(<AtsPipelineView applications={[...ACTIVE_APPS, ...CLOSED_APPS]} />);

    // Board columns exist
    expect(screen.getByTestId("kanban-column-submitted")).toBeInTheDocument();

    // Closed section exists with count
    const toggle = screen.getByTestId("closed-toggle");
    expect(toggle).toHaveTextContent("2");
  });
});
