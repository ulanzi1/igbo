import { describe, it, expect } from "vitest";
import { axe, toHaveNoViolations } from "jest-axe";
import { renderWithPortalProviders, screen } from "@/test-utils/render";
import { ApplicationTimeline } from "./application-timeline";
import type { PortalApplicationTransition } from "@igbo/db/schema/portal-applications";

expect.extend(toHaveNoViolations);

const makeTransition = (
  id: string,
  fromStatus: PortalApplicationTransition["fromStatus"],
  toStatus: PortalApplicationTransition["toStatus"],
  actorRole: PortalApplicationTransition["actorRole"],
  createdAt: Date,
): PortalApplicationTransition => ({
  id,
  applicationId: "app-1",
  fromStatus,
  toStatus,
  actorUserId: "user-1",
  actorRole,
  reason: null,
  createdAt,
});

const SUBMISSION_TRANSITION = makeTransition(
  "tr-1",
  "submitted",
  "submitted",
  "job_seeker",
  new Date("2026-01-01T10:00:00Z"),
);

const REVIEW_TRANSITION = makeTransition(
  "tr-2",
  "submitted",
  "under_review",
  "employer",
  new Date("2026-01-02T10:00:00Z"),
);

const SHORTLIST_TRANSITION = makeTransition(
  "tr-3",
  "under_review",
  "shortlisted",
  "employer",
  new Date("2026-01-03T10:00:00Z"),
);

describe("ApplicationTimeline", () => {
  it("renders the correct number of entries", () => {
    renderWithPortalProviders(
      <ApplicationTimeline transitions={[SUBMISSION_TRANSITION, REVIEW_TRANSITION]} />,
    );
    const list = screen.getByRole("list");
    expect(list.querySelectorAll("li")).toHaveLength(2);
  });

  it("renders 'Application Submitted' for the initial submission entry", () => {
    renderWithPortalProviders(<ApplicationTimeline transitions={[SUBMISSION_TRANSITION]} />);
    expect(screen.getByText("Application Submitted")).toBeTruthy();
  });

  it("renders transition text for subsequent entries", () => {
    renderWithPortalProviders(
      <ApplicationTimeline transitions={[SUBMISSION_TRANSITION, REVIEW_TRANSITION]} />,
    );
    // fromStatus=submitted ("Submitted") → toStatus=under_review ("Under Review")
    expect(screen.getByText("Submitted → Under Review")).toBeTruthy();
  });

  it("renders actor seeker text for job_seeker actor", () => {
    renderWithPortalProviders(<ApplicationTimeline transitions={[SUBMISSION_TRANSITION]} />);
    expect(screen.getByText("By you")).toBeTruthy();
  });

  it("renders actor employer text for employer actor", () => {
    renderWithPortalProviders(
      <ApplicationTimeline transitions={[SUBMISSION_TRANSITION, REVIEW_TRANSITION]} />,
    );
    expect(screen.getByText("By employer")).toBeTruthy();
  });

  it("renders actor admin text for job_admin actor", () => {
    const adminTransition = makeTransition(
      "tr-admin",
      "submitted",
      "rejected",
      "job_admin",
      new Date("2026-01-04T10:00:00Z"),
    );
    renderWithPortalProviders(<ApplicationTimeline transitions={[adminTransition]} />);
    expect(screen.getByText("By admin")).toBeTruthy();
  });

  it("marks the latest entry with aria-current=step", () => {
    renderWithPortalProviders(
      <ApplicationTimeline
        transitions={[SUBMISSION_TRANSITION, REVIEW_TRANSITION, SHORTLIST_TRANSITION]}
      />,
    );
    const listItems = screen.getByRole("list").querySelectorAll("li");
    expect(listItems[2]).toHaveAttribute("aria-current", "step");
    expect(listItems[0]).not.toHaveAttribute("aria-current");
    expect(listItems[1]).not.toHaveAttribute("aria-current");
  });

  it("has no accessibility violations", async () => {
    const { container } = renderWithPortalProviders(
      <ApplicationTimeline transitions={[SUBMISSION_TRANSITION, REVIEW_TRANSITION]} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
