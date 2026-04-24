/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { waitFor } from "@testing-library/react";
import React from "react";
import { renderWithPortalProviders, screen } from "@/test-utils/render";
import { AtsPipelineView } from "./ats-pipeline-view";
import type { KanbanApplication } from "@/components/domain/candidate-card";

// Mock sonner toast (kanban board uses it)
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Mock MessagingDrawer to avoid ConversationThread dependencies in ATS view tests
vi.mock("@/components/messaging/MessagingDrawer", () => ({
  MessagingDrawer: ({
    applicationId,
    open,
    onOpenChange,
    otherParticipantName,
  }: {
    applicationId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    otherParticipantName: string;
  }) =>
    open ? (
      <div
        data-testid="messaging-drawer"
        data-application-id={applicationId}
        data-other-participant={otherParticipantName}
      >
        <button onClick={() => onOpenChange(false)}>Close drawer</button>
      </div>
    ) : null,
}));

// Mock next/navigation — router.refresh() is called after bulk actions
const routerRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: routerRefresh,
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
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

const candidateDetailData = {
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
  notes: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if ((url as string).includes("/status")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: { exists: true, readOnly: false, unreadCount: 0 } }),
      });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ data: candidateDetailData }),
    });
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

describe("AtsPipelineView — bulk selection (P-2.10)", () => {
  it("does not render bulk toolbar when nothing is selected", () => {
    renderWithPortalProviders(<AtsPipelineView applications={MIXED_APPS} />);
    expect(screen.queryByTestId("bulk-action-toolbar")).not.toBeInTheDocument();
  });

  it("shows bulk toolbar after a candidate card is selected", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<AtsPipelineView applications={MIXED_APPS} />);

    await user.click(screen.getByTestId("candidate-select-app-1"));

    expect(screen.getByTestId("bulk-action-toolbar")).toBeInTheDocument();
    expect(screen.getByTestId("bulk-selected-count")).toHaveTextContent("1 selected");
  });

  it("increments the counter when multiple cards are selected", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<AtsPipelineView applications={MIXED_APPS} />);

    await user.click(screen.getByTestId("candidate-select-app-1"));
    await user.click(screen.getByTestId("candidate-select-app-2"));

    expect(screen.getByTestId("bulk-selected-count")).toHaveTextContent("2 selected");
  });

  it("removes the toolbar when selection is cleared via Clear button", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<AtsPipelineView applications={MIXED_APPS} />);

    await user.click(screen.getByTestId("candidate-select-app-1"));
    expect(screen.getByTestId("bulk-action-toolbar")).toBeInTheDocument();

    await user.click(screen.getByTestId("bulk-clear-button"));
    expect(screen.queryByTestId("bulk-action-toolbar")).not.toBeInTheDocument();
  });

  it("deselects a card when its checkbox is clicked again", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<AtsPipelineView applications={MIXED_APPS} />);

    await user.click(screen.getByTestId("candidate-select-app-1"));
    expect(screen.getByTestId("bulk-selected-count")).toHaveTextContent("1 selected");

    await user.click(screen.getByTestId("candidate-select-app-1"));
    expect(screen.queryByTestId("bulk-action-toolbar")).not.toBeInTheDocument();
  });

  it("select-all column checkbox selects every card in the column", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<AtsPipelineView applications={MIXED_APPS} />);

    // Submitted column has app-1; under_review has app-2
    await user.click(screen.getByTestId("kanban-column-select-all-submitted"));
    expect(screen.getByTestId("bulk-selected-count")).toHaveTextContent("1 selected");
  });
});

describe("AtsPipelineView — messaging drawer (P-5.5)", () => {
  it("clicking 'Message Candidate' closes side panel and opens messaging drawer", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<AtsPipelineView applications={MIXED_APPS} />);

    // Open side panel
    await user.click(screen.getByTestId("candidate-card-app-1"));
    expect(await screen.findByTestId("candidate-side-panel")).toBeInTheDocument();

    // Click "Message Candidate"
    const msgBtn = await screen.findByTestId("message-candidate-button");
    await user.click(msgBtn);

    // Side panel should close; drawer opens after animation delay (200ms)
    expect(screen.queryByTestId("candidate-side-panel")).not.toBeInTheDocument();
    expect(await screen.findByTestId("messaging-drawer")).toBeInTheDocument();
  });

  it("messaging drawer renders with correct applicationId", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<AtsPipelineView applications={MIXED_APPS} />);

    await user.click(screen.getByTestId("candidate-card-app-1"));
    await user.click(await screen.findByTestId("message-candidate-button"));

    const drawer = await screen.findByTestId("messaging-drawer");
    expect(drawer).toHaveAttribute("data-application-id", "app-1");
  });

  it("messaging drawer shows seeker name as otherParticipantName", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<AtsPipelineView applications={MIXED_APPS} />);

    await user.click(screen.getByTestId("candidate-card-app-1"));
    await user.click(await screen.findByTestId("message-candidate-button"));

    const drawer = await screen.findByTestId("messaging-drawer");
    expect(drawer).toHaveAttribute("data-other-participant", "Open Ada");
  });

  it("after messaging drawer closes, focus returns to the candidate card (P6)", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<AtsPipelineView applications={MIXED_APPS} />);

    await user.click(screen.getByTestId("candidate-card-app-1"));
    await user.click(await screen.findByTestId("message-candidate-button"));
    expect(await screen.findByTestId("messaging-drawer")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close drawer" }));
    await waitFor(() => expect(screen.queryByTestId("messaging-drawer")).not.toBeInTheDocument());

    const card = screen.getByTestId("candidate-card-app-1");
    expect(document.activeElement).toBe(card);
  });

  it("closing messaging drawer removes it from the DOM", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<AtsPipelineView applications={MIXED_APPS} />);

    await user.click(screen.getByTestId("candidate-card-app-1"));
    await user.click(await screen.findByTestId("message-candidate-button"));
    expect(await screen.findByTestId("messaging-drawer")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close drawer" }));
    await waitFor(() => expect(screen.queryByTestId("messaging-drawer")).not.toBeInTheDocument());
  });
});
