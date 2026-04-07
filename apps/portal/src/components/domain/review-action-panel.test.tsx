import { describe, it, expect, vi, beforeEach } from "vitest";
import { axe, toHaveNoViolations } from "jest-axe";
import userEvent from "@testing-library/user-event";
import { renderWithPortalProviders, screen, waitFor } from "@/test-utils/render";
import { ReviewActionPanel } from "./review-action-panel";

expect.extend(toHaveNoViolations);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

global.fetch = vi.fn();

// Radix Tooltip uses ResizeObserver via @radix-ui/react-use-size, which jsdom
// does not implement. Polyfill with a no-op so the tooltip-text test renders.
if (typeof globalThis.ResizeObserver === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const BASE_PROPS = {
  postingId: "posting-1",
  postingStatus: "pending_review",
  revisionCount: 0,
  locale: "en",
};

beforeEach(() => {
  vi.clearAllMocks();
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({}),
  });
});

describe("ReviewActionPanel", () => {
  it("renders three action buttons", () => {
    renderWithPortalProviders(<ReviewActionPanel {...BASE_PROPS} />);

    expect(screen.getByTestId("approve-button")).toBeInTheDocument();
    expect(screen.getByTestId("reject-button")).toBeInTheDocument();
    expect(screen.getByTestId("request-changes-button")).toBeInTheDocument();
  });

  it("does not render when postingStatus is not pending_review", () => {
    renderWithPortalProviders(<ReviewActionPanel {...BASE_PROPS} postingStatus="active" />);

    expect(screen.queryByTestId("review-action-panel")).not.toBeInTheDocument();
  });

  it("approve button calls fetch with decision=approved", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<ReviewActionPanel {...BASE_PROPS} />);

    await user.click(screen.getByTestId("approve-button"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/admin/jobs/posting-1/review",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ decision: "approved" }),
        }),
      );
    });
  });

  it("Request Changes button is disabled when revisionCount >= 3", () => {
    renderWithPortalProviders(<ReviewActionPanel {...BASE_PROPS} revisionCount={3} />);

    const requestChangesBtn = screen.getByTestId("request-changes-button");
    expect(requestChangesBtn).toBeDisabled();
    // Disabled button must also signal a11y disabled state for AT users.
    expect(requestChangesBtn).toHaveAttribute("aria-disabled", "true");
  });

  it("disabled Request Changes button shows a tooltip explanation on focus", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<ReviewActionPanel {...BASE_PROPS} revisionCount={3} />);

    // Focus the wrapper span (Radix tooltip on disabled button pattern).
    await user.tab();
    await user.tab();

    await waitFor(() => {
      // The translation key resolves to a non-empty string in en.json.
      // We assert SOMETHING with a "Maximum revision" prefix is rendered.
      const tooltips = screen.queryAllByText(/maximum revision/i);
      expect(tooltips.length).toBeGreaterThan(0);
    });
  });

  it("Request Changes button is enabled when revisionCount < 3", () => {
    renderWithPortalProviders(<ReviewActionPanel {...BASE_PROPS} revisionCount={2} />);

    const requestChangesBtn = screen.getByTestId("request-changes-button");
    expect(requestChangesBtn).not.toBeDisabled();
  });

  it("displays previous feedback when provided", () => {
    renderWithPortalProviders(
      <ReviewActionPanel
        {...BASE_PROPS}
        previousFeedback="Please add more salary detail to the posting."
      />,
    );

    expect(screen.getByTestId("previous-feedback")).toBeInTheDocument();
    expect(screen.getByText("Please add more salary detail to the posting.")).toBeInTheDocument();
  });

  it("does not display previous feedback when not provided", () => {
    renderWithPortalProviders(<ReviewActionPanel {...BASE_PROPS} />);

    expect(screen.queryByTestId("previous-feedback")).not.toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = renderWithPortalProviders(<ReviewActionPanel {...BASE_PROPS} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
