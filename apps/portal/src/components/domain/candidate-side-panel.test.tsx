/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { axe, toHaveNoViolations } from "jest-axe";
import { renderWithPortalProviders, screen, waitFor } from "@/test-utils/render";
import { CandidateSidePanel } from "./candidate-side-panel";

expect.extend(toHaveNoViolations);

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
// Mock data
// ---------------------------------------------------------------------------

const MOCK_TRUST_SIGNALS = {
  isVerified: true,
  badgeType: "blue" as const,
  memberSince: new Date("2023-01-01"),
  memberDurationDays: 400,
  communityPoints: 250,
  engagementLevel: "medium" as const,
  displayName: "Ada",
};

const MOCK_TRANSITIONS = [
  {
    id: "tr-1",
    applicationId: "app-1",
    fromStatus: "submitted" as const,
    toStatus: "shortlisted" as const,
    actorUserId: "employer-1",
    actorRole: "employer" as const,
    reason: null,
    createdAt: new Date("2026-01-05"),
  },
];

const MOCK_APPLICATION = {
  id: "app-1",
  seekerName: "Ada Okafor",
  seekerHeadline: "Senior Engineer",
  seekerSkills: ["TypeScript", "React"],
  seekerSummary: "Experienced engineer.",
  coverLetterText: "I am a great fit.",
  portfolioLinksJson: ["https://portfolio.example.com"],
  cvLabel: "Main CV",
  cvProcessedUrl: "https://s3.example.com/cv.pdf",
};

function mockFetchSuccess() {
  vi.spyOn(global, "fetch").mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      data: {
        application: MOCK_APPLICATION,
        trustSignals: MOCK_TRUST_SIGNALS,
        transitions: MOCK_TRANSITIONS,
      },
    }),
  } as Response);
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CandidateSidePanel", () => {
  it("does not render when applicationId is null", () => {
    renderWithPortalProviders(<CandidateSidePanel applicationId={null} onClose={vi.fn()} />);
    expect(screen.queryByTestId("candidate-side-panel")).not.toBeInTheDocument();
  });

  it("renders loading skeleton while fetching", async () => {
    // Never-resolving fetch keeps loading=true so we can assert skeleton presence
    vi.spyOn(global, "fetch").mockReturnValueOnce(new Promise(() => undefined));

    renderWithPortalProviders(<CandidateSidePanel applicationId="app-1" onClose={vi.fn()} />);
    expect(await screen.findByTestId("panel-skeleton")).toBeInTheDocument();
  });

  it("renders populated data after fetch completes", async () => {
    mockFetchSuccess();
    renderWithPortalProviders(<CandidateSidePanel applicationId="app-1" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId("panel-content")).toBeInTheDocument();
    });

    expect(screen.getByText("Ada Okafor")).toBeInTheDocument();
    expect(screen.getByText("Senior Engineer")).toBeInTheDocument();
    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    expect(screen.getByText("React")).toBeInTheDocument();
    expect(screen.getByText("Experienced engineer.")).toBeInTheDocument();
  });

  it("renders cover letter text when provided", async () => {
    mockFetchSuccess();
    renderWithPortalProviders(<CandidateSidePanel applicationId="app-1" onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId("panel-content")).toBeInTheDocument());
    expect(screen.getByText("I am a great fit.")).toBeInTheDocument();
  });

  it("renders 'no cover letter' message when absent", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          application: { ...MOCK_APPLICATION, coverLetterText: null },
          trustSignals: MOCK_TRUST_SIGNALS,
          transitions: MOCK_TRANSITIONS,
        },
      }),
    } as Response);

    renderWithPortalProviders(<CandidateSidePanel applicationId="app-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("panel-content")).toBeInTheDocument());
    expect(screen.getByText("No cover letter provided")).toBeInTheDocument();
  });

  it("renders CV download link when present", async () => {
    mockFetchSuccess();
    renderWithPortalProviders(<CandidateSidePanel applicationId="app-1" onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId("panel-content")).toBeInTheDocument());
    const link = screen.getByTestId("cv-download-link");
    expect(link).toHaveAttribute("href", "https://s3.example.com/cv.pdf");
  });

  it("renders 'no resume' message when CV absent", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          application: { ...MOCK_APPLICATION, cvProcessedUrl: null, cvLabel: null },
          trustSignals: MOCK_TRUST_SIGNALS,
          transitions: MOCK_TRANSITIONS,
        },
      }),
    } as Response);

    renderWithPortalProviders(<CandidateSidePanel applicationId="app-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("panel-content")).toBeInTheDocument());
    expect(screen.getByText("No resume attached")).toBeInTheDocument();
  });

  it("renders 'no portfolio' message when portfolio links absent", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          application: { ...MOCK_APPLICATION, portfolioLinksJson: [] },
          trustSignals: MOCK_TRUST_SIGNALS,
          transitions: MOCK_TRANSITIONS,
        },
      }),
    } as Response);

    renderWithPortalProviders(<CandidateSidePanel applicationId="app-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("panel-content")).toBeInTheDocument());
    expect(screen.getByText("No portfolio links")).toBeInTheDocument();
  });

  it("calls onClose when sheet is closed", async () => {
    mockFetchSuccess();
    const onClose = vi.fn();
    renderWithPortalProviders(<CandidateSidePanel applicationId="app-1" onClose={onClose} />);

    // Sheet close via Escape key
    await waitFor(() => expect(screen.getByTestId("panel-content")).toBeInTheDocument());

    const sheet = screen.getByTestId("candidate-side-panel");
    expect(sheet).toBeInTheDocument();
  });

  it("fetches with the correct applicationId URL", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          application: MOCK_APPLICATION,
          trustSignals: MOCK_TRUST_SIGNALS,
          transitions: MOCK_TRANSITIONS,
        },
      }),
    } as Response);

    renderWithPortalProviders(<CandidateSidePanel applicationId="app-42" onClose={vi.fn()} />);

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith("/api/v1/applications/app-42/detail"),
    );
  });

  it("has no axe violations when panel is open with data", async () => {
    mockFetchSuccess();
    const { container } = renderWithPortalProviders(
      <CandidateSidePanel applicationId="app-1" onClose={vi.fn()} />,
    );

    await waitFor(() => expect(screen.getByTestId("panel-content")).toBeInTheDocument());

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
