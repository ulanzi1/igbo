// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    if (params) return `${key}(${JSON.stringify(params)})`;
    return key;
  },
  useFormatter: () => ({
    dateTime: (d: Date) => d.toISOString(),
  }),
}));

beforeAll(() => {
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
});

import { ApplicationTimeline } from "./application-timeline";
import type { PortalApplicationTransition } from "@igbo/db/schema/portal-applications";

const makeTransition = (
  overrides: Partial<PortalApplicationTransition> = {},
): PortalApplicationTransition =>
  ({
    id: "t1",
    applicationId: "app-1",
    fromStatus: "submitted",
    toStatus: "under_review",
    actorUserId: "user-1",
    actorRole: "employer",
    reason: null,
    createdAt: new Date("2026-01-01T10:00:00Z"),
    ...overrides,
  }) as unknown as PortalApplicationTransition;

const COMPANY_NAME = "Acme Corp";
const VIEWED_AT = new Date("2026-01-02T12:00:00Z");

describe("ApplicationTimeline", () => {
  it("renders timeline with status transitions", () => {
    render(<ApplicationTimeline transitions={[makeTransition()]} />);
    expect(screen.getByRole("list")).toBeInTheDocument();
  });

  it("renders 'Viewed by [Company]' entry when viewedBy provided", () => {
    render(
      <ApplicationTimeline
        transitions={[makeTransition()]}
        viewedBy={{ companyName: COMPANY_NAME, viewedAt: VIEWED_AT }}
      />,
    );
    expect(screen.getByText(/timelineEntry/i)).toBeInTheDocument();
  });

  it("omits 'Viewed by' entry when viewedBy is null", () => {
    render(<ApplicationTimeline transitions={[makeTransition()]} viewedBy={null} />);
    expect(screen.queryByText(/timelineEntry/i)).not.toBeInTheDocument();
  });

  it("omits 'Viewed by' entry when viewedBy is undefined", () => {
    render(<ApplicationTimeline transitions={[makeTransition()]} />);
    expect(screen.queryByText(/timelineEntry/i)).not.toBeInTheDocument();
  });

  it("renders both viewed entry AND status transitions together without overlap", () => {
    const t1 = makeTransition({ id: "t1", createdAt: new Date("2026-01-01") });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t2 = makeTransition({
      id: "t2",
      createdAt: new Date("2026-01-03"),
      fromStatus: "under_review",
      toStatus: "shortlisted",
    } as any);
    render(
      <ApplicationTimeline
        transitions={[t1, t2]}
        viewedBy={{ companyName: COMPANY_NAME, viewedAt: VIEWED_AT }}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
  });

  it("sorts viewed entry chronologically between transitions", () => {
    const t1 = makeTransition({ id: "t1", createdAt: new Date("2026-01-01") });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t2 = makeTransition({
      id: "t2",
      createdAt: new Date("2026-01-03"),
      fromStatus: "under_review",
      toStatus: "shortlisted",
    } as any);
    render(
      <ApplicationTimeline
        transitions={[t1, t2]}
        viewedBy={{ companyName: COMPANY_NAME, viewedAt: VIEWED_AT }}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items[1]).toHaveAttribute("aria-label", "timelineAriaLabel");
  });

  it("viewedBy entry contains company name", () => {
    render(
      <ApplicationTimeline
        transitions={[]}
        viewedBy={{ companyName: COMPANY_NAME, viewedAt: VIEWED_AT }}
      />,
    );
    expect(screen.getByText(/Acme Corp/)).toBeInTheDocument();
  });

  it("eye icon aria-hidden present in viewed entry", () => {
    render(
      <ApplicationTimeline
        transitions={[]}
        viewedBy={{ companyName: COMPANY_NAME, viewedAt: VIEWED_AT }}
      />,
    );
    const hiddenEls = document.querySelectorAll("[aria-hidden='true']");
    expect(hiddenEls.length).toBeGreaterThan(0);
  });

  // --- Restored coverage from pre-P-6.5 tests ---

  it("renders 'Application Submitted' for initial submission (fromStatus === toStatus at index 0)", () => {
    const t = makeTransition({ fromStatus: "submitted", toStatus: "submitted" });
    render(<ApplicationTimeline transitions={[t]} />);
    expect(screen.getByText("timelineSubmitted")).toBeInTheDocument();
  });

  it("renders transition text for subsequent entries", () => {
    const t1 = makeTransition({
      id: "t1",
      fromStatus: "submitted",
      toStatus: "submitted",
      createdAt: new Date("2026-01-01"),
    });
    const t2 = makeTransition({
      id: "t2",
      fromStatus: "submitted",
      toStatus: "under_review",
      createdAt: new Date("2026-01-02"),
    });
    render(<ApplicationTimeline transitions={[t1, t2]} />);
    expect(screen.getByText(/timelineTransition/)).toBeInTheDocument();
  });

  it("renders actor role text (seeker, employer, admin)", () => {
    const seekerTr = makeTransition({
      id: "t1",
      actorRole: "job_seeker",
      createdAt: new Date("2026-01-01"),
    });
    const employerTr = makeTransition({
      id: "t2",
      actorRole: "employer",
      createdAt: new Date("2026-01-02"),
    });
    const adminTr = makeTransition({
      id: "t3",
      actorRole: "job_admin",
      createdAt: new Date("2026-01-03"),
    });
    render(<ApplicationTimeline transitions={[seekerTr, employerTr, adminTr]} />);
    expect(screen.getByText("timelineActorSeeker")).toBeInTheDocument();
    expect(screen.getByText("timelineActorEmployer")).toBeInTheDocument();
    expect(screen.getByText("timelineActorAdmin")).toBeInTheDocument();
  });

  it("marks the latest transition entry with aria-current='step'", () => {
    const t1 = makeTransition({ id: "t1", createdAt: new Date("2026-01-01") });
    const t2 = makeTransition({ id: "t2", createdAt: new Date("2026-01-02") });
    render(<ApplicationTimeline transitions={[t1, t2]} />);
    const items = screen.getAllByRole("listitem");
    expect(items[items.length - 1]).toHaveAttribute("aria-current", "step");
  });

  it("does not set aria-current='step' on viewed entry even when it is chronologically last", () => {
    const t1 = makeTransition({ id: "t1", createdAt: new Date("2026-01-01") });
    render(
      <ApplicationTimeline
        transitions={[t1]}
        viewedBy={{ companyName: COMPANY_NAME, viewedAt: new Date("2026-01-05") }}
      />,
    );
    const items = screen.getAllByRole("listitem");
    // The viewed entry (last item) should NOT have aria-current
    const lastItem = items[items.length - 1]!;
    expect(lastItem).not.toHaveAttribute("aria-current", "step");
  });
});
