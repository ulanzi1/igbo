// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { axe, toHaveNoViolations } from "jest-axe";
import { renderWithPortalProviders, screen, waitFor } from "@/test-utils/render";
import { SimilarJobsSection } from "./similar-jobs-section";
import type { JobSearchResultItem } from "@/lib/validations/job-search";
import type { MatchScoreResult } from "@igbo/config";

expect.extend(toHaveNoViolations);

// Hoist mocks before imports
const mockUseSimilarJobs = vi.hoisted(() => vi.fn());
const mockUseMatchScores = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-similar-jobs", () => ({
  useSimilarJobs: mockUseSimilarJobs,
}));

vi.mock("@/hooks/use-match-scores", () => ({
  useMatchScores: mockUseMatchScores,
}));

const sampleJob: JobSearchResultItem = {
  id: "job-1",
  title: "Frontend Developer",
  companyName: "Acme Corp",
  companyId: "company-1",
  companyLogoUrl: null,
  location: "Lagos, Nigeria",
  salaryMin: 60000,
  salaryMax: 90000,
  salaryCompetitiveOnly: false,
  employmentType: "full_time",
  culturalContext: null,
  applicationDeadline: null,
  createdAt: "2026-04-10T00:00:00Z",
  relevance: null,
  snippet: null,
};

const sampleScore: MatchScoreResult = {
  score: 85,
  tier: "strong",
  signals: { skillsOverlap: 60, locationMatch: true, employmentTypeMatch: true },
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no match scores
  mockUseMatchScores.mockReturnValue({ scores: {}, isLoading: false });
});

describe("SimilarJobsSection — loading state", () => {
  it("renders 3 skeleton cards while loading", () => {
    mockUseSimilarJobs.mockReturnValue({ jobs: [], isLoading: true, error: false });

    renderWithPortalProviders(<SimilarJobsSection jobId="job-1" isSeeker={false} />);

    const section = screen.getByTestId("similar-jobs-section");
    expect(section).toHaveAttribute("aria-busy", "true");
    expect(screen.getAllByTestId("job-result-card-skeleton")).toHaveLength(3);
  });
});

describe("SimilarJobsSection — results state", () => {
  it("renders heading and job cards when similar jobs are available", () => {
    mockUseSimilarJobs.mockReturnValue({ jobs: [sampleJob], isLoading: false, error: false });

    renderWithPortalProviders(<SimilarJobsSection jobId="job-1" isSeeker={false} />);

    expect(screen.getByTestId("similar-jobs-section")).toBeInTheDocument();
    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings[0]).toHaveTextContent("Similar Jobs");
    expect(screen.getByTestId("job-result-card")).toBeInTheDocument();
    expect(screen.getByText("Frontend Developer")).toBeInTheDocument();
  });

  it("passes match scores to JobResultCard when seeker has scores", () => {
    mockUseSimilarJobs.mockReturnValue({ jobs: [sampleJob], isLoading: false, error: false });
    mockUseMatchScores.mockReturnValue({ scores: { "job-1": sampleScore }, isLoading: false });

    const { container } = renderWithPortalProviders(
      <SimilarJobsSection jobId="job-1" isSeeker={true} />,
    );

    // MatchPill should be present (strong match score)
    expect(container.querySelector('[data-testid="match-pill"]')).toBeInTheDocument();
  });

  it("shows CompleteProfilePrompt when seeker has no match scores and jobs exist", () => {
    mockUseSimilarJobs.mockReturnValue({ jobs: [sampleJob], isLoading: false, error: false });
    mockUseMatchScores.mockReturnValue({ scores: {}, isLoading: false });

    renderWithPortalProviders(<SimilarJobsSection jobId="job-1" isSeeker={true} />);

    expect(screen.getByTestId("complete-profile-prompt")).toBeInTheDocument();
  });

  it("does NOT show CompleteProfilePrompt for guests (isSeeker=false)", () => {
    mockUseSimilarJobs.mockReturnValue({ jobs: [sampleJob], isLoading: false, error: false });
    mockUseMatchScores.mockReturnValue({ scores: {}, isLoading: false });

    renderWithPortalProviders(<SimilarJobsSection jobId="job-1" isSeeker={false} />);

    expect(screen.queryByTestId("complete-profile-prompt")).not.toBeInTheDocument();
  });
});

describe("SimilarJobsSection — empty state", () => {
  it("shows empty state message when no similar jobs found", () => {
    mockUseSimilarJobs.mockReturnValue({ jobs: [], isLoading: false, error: false });

    renderWithPortalProviders(<SimilarJobsSection jobId="job-1" isSeeker={false} />);

    expect(screen.getByTestId("similar-jobs-section")).toBeInTheDocument();
    expect(screen.getByText("No similar jobs found right now.")).toBeInTheDocument();
  });

  it("includes link to discovery page in empty state", () => {
    mockUseSimilarJobs.mockReturnValue({ jobs: [], isLoading: false, error: false });

    renderWithPortalProviders(<SimilarJobsSection jobId="job-1" isSeeker={false} />);

    const link = screen.getByText("Browse all jobs");
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute("href", "/en/jobs");
  });
});

describe("SimilarJobsSection — error state", () => {
  it("shows error message on fetch failure", () => {
    mockUseSimilarJobs.mockReturnValue({ jobs: [], isLoading: false, error: true });

    renderWithPortalProviders(<SimilarJobsSection jobId="job-1" isSeeker={false} />);

    expect(screen.getByTestId("similar-jobs-section")).toBeInTheDocument();
    expect(
      screen.getByText("Could not load similar jobs. Please try again later."),
    ).toBeInTheDocument();
  });
});

describe("SimilarJobsSection — accessibility", () => {
  it("passes axe check in results state", async () => {
    mockUseSimilarJobs.mockReturnValue({ jobs: [sampleJob], isLoading: false, error: false });

    const { container } = renderWithPortalProviders(
      <SimilarJobsSection jobId="job-1" isSeeker={false} />,
    );

    await waitFor(async () => {
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  it("passes axe check in empty state", async () => {
    mockUseSimilarJobs.mockReturnValue({ jobs: [], isLoading: false, error: false });

    const { container } = renderWithPortalProviders(
      <SimilarJobsSection jobId="job-1" isSeeker={false} />,
    );

    await waitFor(async () => {
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
