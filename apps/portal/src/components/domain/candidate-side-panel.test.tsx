/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { renderWithPortalProviders, screen, within } from "@/test-utils/render";
import { CandidateSidePanel, type CandidateDetailResponse } from "./candidate-side-panel";

expect.extend(toHaveNoViolations);

// ---------------------------------------------------------------------------
// jsdom polyfills — Radix Dialog (Sheet) uses pointer capture + scrollIntoView
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
// Test fixtures
// ---------------------------------------------------------------------------
const APP_ID = "11111111-1111-1111-1111-111111111111";

function makeDetail(
  overrides: Partial<CandidateDetailResponse["application"]> = {},
): CandidateDetailResponse {
  return {
    application: {
      id: APP_ID,
      jobId: "22222222-2222-2222-2222-222222222222",
      seekerUserId: "33333333-3333-3333-3333-333333333333",
      status: "submitted",
      createdAt: new Date("2024-03-15").toISOString(),
      updatedAt: new Date("2024-03-15").toISOString(),
      coverLetterText: "I am very interested in this role because...",
      portfolioLinksJson: ["https://example.com/portfolio", "https://github.com/ada"],
      selectedCvId: "cv-1",
      jobTitle: "Senior Engineer",
      seekerName: "Ada Okafor",
      seekerHeadline: "Senior Software Engineer",
      seekerProfileId: "sp-1",
      seekerSummary: "10+ years building web applications",
      seekerSkills: ["typescript", "react", "node"],
      cvId: "cv-1",
      cvLabel: "Main CV",
      cvProcessedUrl: "https://cdn.example.com/cv-1.pdf",
      ...overrides,
    },
    trustSignals: {
      isVerified: true,
      badgeType: "blue",
      memberSince: new Date("2023-01-01"),
      memberDurationDays: 500,
      communityPoints: 1200,
      engagementLevel: "high",
      displayName: "Ada Okafor",
    },
    transitions: [
      {
        id: "t-1",
        applicationId: APP_ID,
        fromStatus: "submitted",
        toStatus: "submitted",
        actorUserId: "33333333-3333-3333-3333-333333333333",
        actorRole: "job_seeker",
        reason: null,
        createdAt: new Date("2024-03-15T10:00:00Z"),
      },
    ],
    notes: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Closed / Open behavior
// ---------------------------------------------------------------------------
describe("CandidateSidePanel — open/close", () => {
  it("does not render content when applicationId is null", () => {
    const onClose = vi.fn();
    renderWithPortalProviders(<CandidateSidePanel applicationId={null} onClose={onClose} />);
    expect(screen.queryByTestId("candidate-side-panel")).not.toBeInTheDocument();
  });

  it("renders Sheet content when applicationId is non-null", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: makeDetail() }),
    }) as unknown as typeof fetch;

    const onClose = vi.fn();
    renderWithPortalProviders(<CandidateSidePanel applicationId={APP_ID} onClose={onClose} />);
    expect(await screen.findByTestId("candidate-side-panel")).toBeInTheDocument();
  });

  it("fires onClose when the close button is clicked", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: makeDetail() }),
    }) as unknown as typeof fetch;

    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithPortalProviders(<CandidateSidePanel applicationId={APP_ID} onClose={onClose} />);

    await screen.findByText("Ada Okafor");
    // Radix dialog close button has sr-only "Close" label
    const closeBtn = screen.getByRole("button", { name: /close/i });
    await user.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 2. Loading state
// ---------------------------------------------------------------------------
describe("CandidateSidePanel — loading", () => {
  it("shows skeleton while fetching", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    ) as unknown as typeof fetch;

    renderWithPortalProviders(<CandidateSidePanel applicationId={APP_ID} onClose={() => {}} />);

    // Loading skeleton should be present immediately
    expect(await screen.findByLabelText(/Loading candidate details/i)).toBeInTheDocument();

    resolveFetch({ ok: true, json: () => Promise.resolve({ data: makeDetail() }) });
  });
});

// ---------------------------------------------------------------------------
// 3. Populated data rendering
// ---------------------------------------------------------------------------
describe("CandidateSidePanel — populated", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: makeDetail() }),
    }) as unknown as typeof fetch;
  });

  it("renders seeker name, headline, and summary", async () => {
    renderWithPortalProviders(<CandidateSidePanel applicationId={APP_ID} onClose={() => {}} />);
    expect(await screen.findByText("Ada Okafor")).toBeInTheDocument();
    expect(screen.getByText("Senior Software Engineer")).toBeInTheDocument();
    expect(screen.getByText(/10\+ years building web applications/)).toBeInTheDocument();
  });

  it("renders skills as badges", async () => {
    renderWithPortalProviders(<CandidateSidePanel applicationId={APP_ID} onClose={() => {}} />);
    await screen.findByText("Ada Okafor");
    expect(screen.getByText("typescript")).toBeInTheDocument();
    expect(screen.getByText("react")).toBeInTheDocument();
    expect(screen.getByText("node")).toBeInTheDocument();
  });

  it("renders cover letter text", async () => {
    renderWithPortalProviders(<CandidateSidePanel applicationId={APP_ID} onClose={() => {}} />);
    expect(await screen.findByText(/I am very interested in this role/)).toBeInTheDocument();
  });

  it("renders CV download link with cvLabel", async () => {
    renderWithPortalProviders(<CandidateSidePanel applicationId={APP_ID} onClose={() => {}} />);
    const cvLink = await screen.findByRole("link", { name: /Main CV/ });
    expect(cvLink).toHaveAttribute("href", "https://cdn.example.com/cv-1.pdf");
    expect(cvLink).toHaveAttribute("target", "_blank");
  });

  it("renders portfolio links", async () => {
    renderWithPortalProviders(<CandidateSidePanel applicationId={APP_ID} onClose={() => {}} />);
    await screen.findByText("Ada Okafor");
    expect(
      screen.getByRole("link", { name: /https:\/\/example\.com\/portfolio/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /https:\/\/github\.com\/ada/ })).toBeInTheDocument();
  });

  it("renders timeline list with at least one entry", async () => {
    renderWithPortalProviders(<CandidateSidePanel applicationId={APP_ID} onClose={() => {}} />);
    await screen.findByText("Ada Okafor");
    // Timeline uses an <ol> labelled by translated timelineTitle; find by role=list
    const lists = screen.getAllByRole("list");
    // At least one list (timeline + other content lists)
    expect(lists.length).toBeGreaterThanOrEqual(1);
  });

  it("renders TrustSignalsPanel when trustSignals are provided", async () => {
    renderWithPortalProviders(<CandidateSidePanel applicationId={APP_ID} onClose={() => {}} />);
    await screen.findByText("Ada Okafor");
    // TrustSignalsPanel renders verifiedMember label when isVerified=true
    expect(screen.getAllByText(/Verified/i).length).toBeGreaterThan(0);
  });

  it("renders NotesSection with provided notes (P-2.10)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: {
          ...makeDetail(),
          notes: [
            {
              id: "note-1",
              applicationId: APP_ID,
              authorUserId: "employer-1",
              authorName: "Chidi Eze",
              content: "Strong candidate, schedule follow-up.",
              createdAt: new Date("2024-03-16T10:00:00Z"),
            },
          ],
        },
      }),
    }) as unknown as typeof fetch;

    renderWithPortalProviders(<CandidateSidePanel applicationId={APP_ID} onClose={() => {}} />);
    await screen.findByText("Ada Okafor");
    // Notes heading + note content render
    expect(screen.getByRole("heading", { name: /^Notes$/i })).toBeInTheDocument();
    expect(screen.getByText("Strong candidate, schedule follow-up.")).toBeInTheDocument();
    expect(screen.getByText("Chidi Eze")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 4. Empty states
// ---------------------------------------------------------------------------
describe("CandidateSidePanel — empty states", () => {
  it("shows 'no cover letter' fallback when coverLetterText is null", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: makeDetail({ coverLetterText: null }) }),
    }) as unknown as typeof fetch;

    renderWithPortalProviders(<CandidateSidePanel applicationId={APP_ID} onClose={() => {}} />);
    expect(await screen.findByText(/No cover letter provided/)).toBeInTheDocument();
  });

  it("shows 'no resume attached' when cvProcessedUrl is null", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: makeDetail({ cvProcessedUrl: null, cvLabel: null, cvId: null }),
      }),
    }) as unknown as typeof fetch;

    renderWithPortalProviders(<CandidateSidePanel applicationId={APP_ID} onClose={() => {}} />);
    expect(await screen.findByText(/No resume attached/)).toBeInTheDocument();
  });

  it("filters out non-https portfolio links (javascript: XSS prevention)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: makeDetail({
          portfolioLinksJson: [
            "https://legit.example.com/portfolio",
            "javascript:alert('xss')",
            "data:text/html,<script>alert(1)</script>",
          ],
        }),
      }),
    }) as unknown as typeof fetch;

    renderWithPortalProviders(<CandidateSidePanel applicationId={APP_ID} onClose={() => {}} />);
    await screen.findByText("Ada Okafor");

    // Safe link must be rendered
    expect(screen.getByRole("link", { name: /legit\.example\.com/ })).toBeInTheDocument();
    // Malicious links must NOT become anchor tags
    const links = screen.getAllByRole("link");
    links.forEach((link) => {
      const href = link.getAttribute("href") ?? "";
      expect(href).not.toMatch(/^javascript:/i);
      expect(href).not.toMatch(/^data:/i);
    });
  });

  it("shows 'no portfolio links' when portfolioLinksJson is empty", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: makeDetail({ portfolioLinksJson: [] }),
      }),
    }) as unknown as typeof fetch;

    renderWithPortalProviders(<CandidateSidePanel applicationId={APP_ID} onClose={() => {}} />);
    expect(await screen.findByText(/No portfolio links/)).toBeInTheDocument();
  });

  it("shows 'no skills listed' when seekerSkills is empty", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: makeDetail({ seekerSkills: [] }),
      }),
    }) as unknown as typeof fetch;

    renderWithPortalProviders(<CandidateSidePanel applicationId={APP_ID} onClose={() => {}} />);
    expect(await screen.findByText(/No skills listed/)).toBeInTheDocument();
  });

  it("shows 'no summary provided' when seekerSummary is null", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: makeDetail({ seekerSummary: null }),
      }),
    }) as unknown as typeof fetch;

    renderWithPortalProviders(<CandidateSidePanel applicationId={APP_ID} onClose={() => {}} />);
    expect(await screen.findByText(/No summary provided/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 5. Error state
// ---------------------------------------------------------------------------
describe("CandidateSidePanel — error", () => {
  it("shows error message when fetch fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({}),
    }) as unknown as typeof fetch;

    renderWithPortalProviders(<CandidateSidePanel applicationId={APP_ID} onClose={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Failed to load/);
  });

  it("shows error message when fetch rejects (network error)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network")) as unknown as typeof fetch;

    renderWithPortalProviders(<CandidateSidePanel applicationId={APP_ID} onClose={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Failed to load/);
  });
});

// ---------------------------------------------------------------------------
// 6. Re-fetch on applicationId change
// ---------------------------------------------------------------------------
describe("CandidateSidePanel — re-fetch", () => {
  it("re-fetches when applicationId changes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: makeDetail() }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { rerender } = renderWithPortalProviders(
      <CandidateSidePanel applicationId={APP_ID} onClose={() => {}} />,
    );
    await screen.findByText("Ada Okafor");
    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/applications/${APP_ID}/detail`);

    const APP_ID_2 = "44444444-4444-4444-4444-444444444444";
    rerender(<CandidateSidePanel applicationId={APP_ID_2} onClose={() => {}} />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(`/api/v1/applications/${APP_ID_2}/detail`);
    });
  });
});

// ---------------------------------------------------------------------------
// 7. Accessibility
// ---------------------------------------------------------------------------
describe("CandidateSidePanel — accessibility", () => {
  it("Sheet content has aria-label from Portal.ats.ariaSidePanel", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: makeDetail() }),
    }) as unknown as typeof fetch;

    renderWithPortalProviders(<CandidateSidePanel applicationId={APP_ID} onClose={() => {}} />);
    const panel = await screen.findByTestId("candidate-side-panel");
    expect(panel).toHaveAttribute("aria-label", "Candidate details panel");
  });

  it("has no axe violations when populated", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: makeDetail() }),
    }) as unknown as typeof fetch;

    const { container } = renderWithPortalProviders(
      <CandidateSidePanel applicationId={APP_ID} onClose={() => {}} />,
    );
    await screen.findByText("Ada Okafor");
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ---------------------------------------------------------------------------
// 8. Message Candidate button (P-5.5)
// ---------------------------------------------------------------------------
describe("CandidateSidePanel — Message Candidate button", () => {
  const STATUS_RESPONSE = { data: { exists: true, readOnly: false, unreadCount: 0 } };
  const STATUS_UNREAD_RESPONSE = { data: { exists: true, readOnly: false, unreadCount: 2 } };

  function setupFetch(unreadCount = 0) {
    const statusData = unreadCount > 0 ? STATUS_UNREAD_RESPONSE : STATUS_RESPONSE;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if ((url as string).includes("/status")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(statusData),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: makeDetail() }),
      });
    }) as unknown as typeof fetch;
  }

  it("renders 'Message Candidate' button when onOpenMessaging is provided", async () => {
    setupFetch();
    const onOpenMessaging = vi.fn();
    renderWithPortalProviders(
      <CandidateSidePanel
        applicationId={APP_ID}
        onClose={() => {}}
        onOpenMessaging={onOpenMessaging}
      />,
    );
    expect(await screen.findByTestId("message-candidate-button")).toBeInTheDocument();
    expect(screen.getByTestId("message-candidate-button")).toHaveTextContent("Message Candidate");
  });

  it("does not render 'Message Candidate' button when onOpenMessaging is not provided", async () => {
    setupFetch();
    renderWithPortalProviders(<CandidateSidePanel applicationId={APP_ID} onClose={() => {}} />);
    await screen.findByText("Ada Okafor");
    expect(screen.queryByTestId("message-candidate-button")).not.toBeInTheDocument();
  });

  it("button click calls onOpenMessaging with applicationId", async () => {
    setupFetch();
    const user = userEvent.setup();
    const onOpenMessaging = vi.fn();
    renderWithPortalProviders(
      <CandidateSidePanel
        applicationId={APP_ID}
        onClose={() => {}}
        onOpenMessaging={onOpenMessaging}
      />,
    );
    await user.click(await screen.findByTestId("message-candidate-button"));
    expect(onOpenMessaging).toHaveBeenCalledWith(APP_ID);
  });

  it("button shows unread count badge when conversation has unread messages", async () => {
    setupFetch(2);
    const onOpenMessaging = vi.fn();
    renderWithPortalProviders(
      <CandidateSidePanel
        applicationId={APP_ID}
        onClose={() => {}}
        onOpenMessaging={onOpenMessaging}
      />,
    );
    await screen.findByTestId("message-candidate-button");
    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument());
  });

  it("button has descriptive aria-label", async () => {
    setupFetch();
    const onOpenMessaging = vi.fn();
    renderWithPortalProviders(
      <CandidateSidePanel
        applicationId={APP_ID}
        onClose={() => {}}
        onOpenMessaging={onOpenMessaging}
      />,
    );
    const btn = await screen.findByTestId("message-candidate-button");
    expect(btn).toHaveAttribute("aria-label");
    expect(btn.getAttribute("aria-label")).toMatch(/Message Candidate/i);
  });
});

// Unused import guard
void within;
