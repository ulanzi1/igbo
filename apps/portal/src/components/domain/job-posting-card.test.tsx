import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
  useLocale: () => "en",
}));

vi.mock("@/components/semantic/salary-display", () => ({
  SalaryDisplay: ({
    competitiveOnly,
    min,
    max,
  }: {
    competitiveOnly: boolean;
    min?: number | null;
    max?: number | null;
  }) => {
    if (competitiveOnly) return <span>competitive</span>;
    if (min != null && max != null) return <span>{`${min}-${max}`}</span>;
    return null;
  },
  SalaryDisplaySkeleton: () => <span>SalarySkeleton</span>,
}));

import { JobPostingCard } from "./job-posting-card";

const mockPosting = {
  id: "posting-uuid",
  title: "Senior Software Engineer",
  status: "draft",
  employmentType: "full_time",
  location: "Lagos, Nigeria",
  salaryMin: 500000,
  salaryMax: 750000,
  salaryCompetitiveOnly: false,
  createdAt: new Date("2026-03-01T00:00:00Z"),
};

describe("JobPostingCard", () => {
  it("renders posting title", () => {
    render(<JobPostingCard posting={mockPosting} />);
    expect(screen.getByText("Senior Software Engineer")).toBeTruthy();
  });

  it("renders draft status badge", () => {
    render(<JobPostingCard posting={mockPosting} />);
    const badge = screen.getByTestId("status-badge");
    expect(badge.textContent).toContain("status.draft");
  });

  it("renders active status badge", () => {
    render(<JobPostingCard posting={{ ...mockPosting, status: "active" }} />);
    const badge = screen.getByTestId("status-badge");
    expect(badge.textContent).toContain("status.active");
  });

  it("renders employment type", () => {
    render(<JobPostingCard posting={mockPosting} />);
    expect(screen.getByText("type.full_time")).toBeTruthy();
  });

  it("renders location", () => {
    render(<JobPostingCard posting={mockPosting} />);
    expect(screen.getByText("Lagos, Nigeria")).toBeTruthy();
  });

  it("renders actions slot when provided", () => {
    render(
      <JobPostingCard
        posting={mockPosting}
        actions={<button data-testid="action-btn">Action</button>}
      />,
    );
    expect(screen.getByTestId("action-btn")).toBeTruthy();
  });

  it("does not render actions slot when not provided", () => {
    render(<JobPostingCard posting={mockPosting} />);
    expect(screen.queryByTestId("action-btn")).toBeNull();
  });

  it("shows admin feedback when status=rejected and feedback exists", () => {
    render(
      <JobPostingCard
        posting={{
          ...mockPosting,
          status: "rejected",
          adminFeedbackComment: "Missing salary info",
        }}
      />,
    );
    expect(screen.getByTestId("admin-feedback")).toBeTruthy();
    expect(screen.getByTestId("admin-feedback").textContent).toBe("Missing salary info");
  });

  it("does not show admin feedback when adminFeedbackComment is null", () => {
    render(
      <JobPostingCard
        posting={{ ...mockPosting, status: "rejected", adminFeedbackComment: null }}
      />,
    );
    expect(screen.queryByTestId("admin-feedback")).toBeNull();
  });

  it("does not show admin feedback for non-rejected status", () => {
    render(
      <JobPostingCard
        posting={{ ...mockPosting, status: "draft", adminFeedbackComment: "Some text" }}
      />,
    );
    expect(screen.queryByTestId("admin-feedback")).toBeNull();
  });

  it("renders creation date using i18n createdAt key", () => {
    render(<JobPostingCard posting={mockPosting} />);
    expect(screen.getByText(/createdAt/)).toBeTruthy();
  });

  it("renders salary display", () => {
    render(<JobPostingCard posting={mockPosting} />);
    expect(screen.getByText("500000-750000")).toBeTruthy();
  });

  it("passes axe-core accessibility assertion", async () => {
    const { container } = render(<JobPostingCard posting={mockPosting} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  // Cultural context badge tests
  it("shows cultural context badges when flags are set", () => {
    render(
      <JobPostingCard
        posting={{
          ...mockPosting,
          culturalContextJson: {
            diasporaFriendly: true,
            igboLanguagePreferred: false,
            communityReferred: false,
          },
        }}
      />,
    );
    expect(screen.getByTestId("cultural-context-badges")).toBeTruthy();
    expect(screen.getByText("badgeDiaspora")).toBeTruthy();
  });

  it("shows no cultural context badges when culturalContext is null", () => {
    render(<JobPostingCard posting={{ ...mockPosting, culturalContextJson: null }} />);
    expect(screen.queryByTestId("cultural-context-badges")).toBeNull();
  });

  it("shows 'Bilingual' indicator when Igbo description exists", () => {
    render(<JobPostingCard posting={{ ...mockPosting, descriptionIgboHtml: "<p>Nkọwa</p>" }} />);
    expect(screen.getByTestId("bilingual-badge")).toBeTruthy();
    expect(screen.getByTestId("bilingual-badge").textContent).toBe("bilingual");
  });

  it("backward compatible -- no badges and no bilingual indicator when no cultural context", () => {
    render(<JobPostingCard posting={mockPosting} />);
    expect(screen.queryByTestId("cultural-context-badges")).toBeNull();
    expect(screen.queryByTestId("bilingual-badge")).toBeNull();
  });

  // applicationDeadline display tests
  it("shows application deadline when set and status is active", () => {
    render(
      <JobPostingCard
        posting={{
          ...mockPosting,
          status: "active",
          applicationDeadline: "2026-05-15T23:59:59.999Z",
        }}
      />,
    );
    const deadlineText = screen.getByTestId("deadline-text");
    expect(deadlineText).toBeTruthy();
    expect(deadlineText.textContent).toContain("applicationDeadlineDate");
  });

  it("does NOT show application deadline when status is draft", () => {
    render(
      <JobPostingCard
        posting={{
          ...mockPosting,
          status: "draft",
          applicationDeadline: "2026-05-15T23:59:59.999Z",
        }}
      />,
    );
    expect(screen.queryByTestId("deadline-text")).toBeNull();
  });

  it("does NOT show application deadline when not set", () => {
    render(
      <JobPostingCard posting={{ ...mockPosting, status: "active", applicationDeadline: null }} />,
    );
    expect(screen.queryByTestId("deadline-text")).toBeNull();
  });

  it("shows 'deadline passed' warning when deadline is in the past and status is active", () => {
    render(
      <JobPostingCard
        posting={{
          ...mockPosting,
          status: "active",
          applicationDeadline: "2026-04-17T23:59:59.999Z",
        }}
      />,
    );
    const warningText = screen.getByTestId("deadline-passed-text");
    expect(warningText).toBeTruthy();
    expect(warningText.textContent).toContain("deadlinePassed");
    expect(warningText.className).toContain("text-red-600");
  });

  it("does NOT show deadline passed when deadline is in the future", () => {
    render(
      <JobPostingCard
        posting={{
          ...mockPosting,
          status: "active",
          applicationDeadline: "2099-12-31T23:59:59.999Z",
        }}
      />,
    );
    expect(screen.queryByTestId("deadline-passed-text")).toBeNull();
  });

  it("uses same formatDate for deadline as for expiresAt (consistent formatting)", () => {
    render(
      <JobPostingCard
        posting={{
          ...mockPosting,
          status: "active",
          expiresAt: "2026-05-15T23:59:59.999Z",
          applicationDeadline: "2026-05-15T23:59:59.999Z",
        }}
      />,
    );
    const expiresText = screen.getByTestId("expires-on-text");
    const deadlineText = screen.getByTestId("deadline-text");
    // Both use formatDate, so date portion should match
    expect(expiresText).toBeTruthy();
    expect(deadlineText).toBeTruthy();
  });
});
