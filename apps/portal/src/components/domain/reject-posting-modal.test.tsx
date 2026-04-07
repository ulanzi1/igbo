import { describe, it, expect, vi, beforeEach } from "vitest";
import { axe, toHaveNoViolations } from "jest-axe";
import userEvent from "@testing-library/user-event";
import { renderWithPortalProviders, screen, waitFor } from "@/test-utils/render";
import { RejectPostingModal } from "./reject-posting-modal";

// jsdom doesn't implement pointer capture or scrollIntoView — required by Radix UI Select
Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  setPointerCapture: () => undefined,
  releasePointerCapture: () => undefined,
  scrollIntoView: () => undefined,
});

expect.extend(toHaveNoViolations);

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

global.fetch = vi.fn();

const BASE_PROPS = {
  postingId: "posting-1",
  open: true,
  onOpenChange: vi.fn(),
  onSuccess: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({}),
  });
});

describe("RejectPostingModal", () => {
  it("renders the modal when open=true", () => {
    renderWithPortalProviders(<RejectPostingModal {...BASE_PROPS} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("reject-reason-textarea")).toBeInTheDocument();
    expect(screen.getByTestId("reject-category-select")).toBeInTheDocument();
  });

  it("submit button is disabled when reason < 20 chars", async () => {
    renderWithPortalProviders(<RejectPostingModal {...BASE_PROPS} />);

    const textarea = screen.getByTestId("reject-reason-textarea");
    await userEvent.setup().type(textarea, "Too short");

    expect(screen.getByTestId("reject-proceed-button")).toBeDisabled();
  });

  it("submit button is enabled when reason >= 20 chars and category selected", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<RejectPostingModal {...BASE_PROPS} />);

    const textarea = screen.getByTestId("reject-reason-textarea");
    await user.type(textarea, "This is a valid rejection reason text.");

    // Select category via Radix Select — open trigger then click item
    await user.click(screen.getByTestId("reject-category-select"));
    await user.click(screen.getByText("Other"));

    expect(screen.getByTestId("reject-proceed-button")).not.toBeDisabled();
  });

  it("shows confirmation step after clicking proceed", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<RejectPostingModal {...BASE_PROPS} />);

    await user.type(
      screen.getByTestId("reject-reason-textarea"),
      "This posting violates community guidelines.",
    );
    await user.click(screen.getByTestId("reject-category-select"));
    await user.click(screen.getByText("Other"));
    await user.click(screen.getByTestId("reject-proceed-button"));

    expect(screen.getByTestId("reject-confirm-button")).toBeInTheDocument();
    expect(screen.getByTestId("reject-confirm-cancel")).toBeInTheDocument();
  });

  it("submits the reject decision on confirm", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<RejectPostingModal {...BASE_PROPS} />);

    await user.type(
      screen.getByTestId("reject-reason-textarea"),
      "This posting violates community guidelines.",
    );
    await user.click(screen.getByTestId("reject-category-select"));
    await user.click(screen.getByText("Other"));
    await user.click(screen.getByTestId("reject-proceed-button"));
    await user.click(screen.getByTestId("reject-confirm-button"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/admin/jobs/posting-1/review",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            decision: "rejected",
            reason: "This posting violates community guidelines.",
            category: "other",
          }),
        }),
      );
    });
  });

  it("has no accessibility violations", async () => {
    const { container } = renderWithPortalProviders(<RejectPostingModal {...BASE_PROPS} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
