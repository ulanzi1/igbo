/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { renderWithPortalProviders, screen, within } from "@/test-utils/render";
import { CandidateCard, type KanbanApplication } from "./candidate-card";

expect.extend(toHaveNoViolations);

const MOCK_APPLICATION: KanbanApplication = {
  id: "app-1",
  seekerUserId: "seeker-1",
  seekerName: "Ada Okafor",
  seekerHeadline: "Senior Software Engineer",
  seekerProfileId: "sp-1",
  seekerSkills: ["typescript", "react", "node"],
  status: "submitted",
  createdAt: new Date("2024-03-15"),
  coverLetterText: null,
  portfolioLinksJson: [],
  selectedCvId: null,
};

describe("CandidateCard", () => {
  it("renders seeker name and headline", () => {
    renderWithPortalProviders(<CandidateCard application={MOCK_APPLICATION} />);
    expect(screen.getByText("Ada Okafor")).toBeInTheDocument();
    expect(screen.getByText("Senior Software Engineer")).toBeInTheDocument();
  });

  it("renders applied date via useFormatter", () => {
    renderWithPortalProviders(<CandidateCard application={MOCK_APPLICATION} />);
    // Applied {date} pattern — the date is locale-formatted
    expect(screen.getByText(/Applied/)).toBeInTheDocument();
  });

  it("renders skills as badges (up to 3)", () => {
    renderWithPortalProviders(<CandidateCard application={MOCK_APPLICATION} />);
    expect(screen.getByText("typescript")).toBeInTheDocument();
    expect(screen.getByText("react")).toBeInTheDocument();
    expect(screen.getByText("node")).toBeInTheDocument();
  });

  it("renders match score placeholder", () => {
    renderWithPortalProviders(<CandidateCard application={MOCK_APPLICATION} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("has tabindex=0 and role=listitem", () => {
    renderWithPortalProviders(<CandidateCard application={MOCK_APPLICATION} />);
    const card = screen.getByTestId("candidate-card-app-1");
    expect(card).toHaveAttribute("tabindex", "0");
    expect(card).toHaveAttribute("role", "listitem");
  });

  it("has aria-roledescription", () => {
    renderWithPortalProviders(<CandidateCard application={MOCK_APPLICATION} />);
    const card = screen.getByTestId("candidate-card-app-1");
    expect(card).toHaveAttribute("aria-roledescription", "draggable candidate card");
  });

  it("has aria-label with seeker name and headline", () => {
    renderWithPortalProviders(<CandidateCard application={MOCK_APPLICATION} />);
    const card = screen.getByTestId("candidate-card-app-1");
    const label = card.getAttribute("aria-label");
    expect(label).toContain("Ada Okafor");
    expect(label).toContain("Senior Software Engineer");
  });

  it("fires onClick when clicked", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    renderWithPortalProviders(<CandidateCard application={MOCK_APPLICATION} onClick={onClick} />);
    await user.click(screen.getByTestId("candidate-card-app-1"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("fires onClick on Enter key", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    renderWithPortalProviders(<CandidateCard application={MOCK_APPLICATION} onClick={onClick} />);
    const card = screen.getByTestId("candidate-card-app-1");
    card.focus();
    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("fires onClick on Space key", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    renderWithPortalProviders(<CandidateCard application={MOCK_APPLICATION} onClick={onClick} />);
    const card = screen.getByTestId("candidate-card-app-1");
    card.focus();
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("shows status badge when showStatusBadge=true", () => {
    renderWithPortalProviders(
      <CandidateCard application={MOCK_APPLICATION} showStatusBadge={true} />,
    );
    // ApplicationStatusBadge renders a role="status" element
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("hides status badge by default", () => {
    renderWithPortalProviders(<CandidateCard application={MOCK_APPLICATION} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders with isDragging=true (opacity class)", () => {
    renderWithPortalProviders(<CandidateCard application={MOCK_APPLICATION} isDragging={true} />);
    const card = screen.getByTestId("candidate-card-app-1");
    expect(card).toHaveAttribute("data-dragging", "true");
  });

  it("handles null seeker name gracefully", () => {
    renderWithPortalProviders(
      <CandidateCard application={{ ...MOCK_APPLICATION, seekerName: null }} />,
    );
    // Both fallback name and match score placeholder render "—"
    const card = screen.getByTestId("candidate-card-app-1");
    expect(within(card).getAllByText("—").length).toBeGreaterThanOrEqual(1);
  });

  it("handles null headline gracefully", () => {
    renderWithPortalProviders(
      <CandidateCard application={{ ...MOCK_APPLICATION, seekerHeadline: null }} />,
    );
    // The card still renders without crashing
    expect(screen.getByTestId("candidate-card-app-1")).toBeInTheDocument();
  });

  it("applies compact padding (p-2.5) when density is compact", () => {
    renderWithPortalProviders(<CandidateCard application={MOCK_APPLICATION} />, {
      density: "compact",
    });
    const card = screen.getByTestId("candidate-card-app-1");
    expect(card.className).toContain("p-2.5");
  });

  it("applies dense padding (p-2) when density is dense", () => {
    renderWithPortalProviders(<CandidateCard application={MOCK_APPLICATION} />, {
      density: "dense",
    });
    const card = screen.getByTestId("candidate-card-app-1");
    expect(card.className).toContain("p-2");
    expect(card.className).not.toContain("p-2.5");
  });

  it("hides skills badges in dense density mode", () => {
    renderWithPortalProviders(<CandidateCard application={MOCK_APPLICATION} />, {
      density: "dense",
    });
    // Skills are hidden at dense density (line-space tradeoff)
    expect(screen.queryByText("typescript")).not.toBeInTheDocument();
  });

  it("has no axe violations (wrapped in list container)", async () => {
    const { container } = renderWithPortalProviders(
      <div role="list">
        <CandidateCard application={MOCK_APPLICATION} onClick={() => {}} />
      </div>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
