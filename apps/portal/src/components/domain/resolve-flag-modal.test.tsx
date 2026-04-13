import { describe, it, expect, vi, beforeEach } from "vitest";
import { axe, toHaveNoViolations } from "jest-axe";
import userEvent from "@testing-library/user-event";
import { renderWithPortalProviders, screen, waitFor } from "@/test-utils/render";
import { ResolveFlagModal } from "./resolve-flag-modal";

// jsdom doesn't implement pointer capture — required by Radix UI RadioGroup
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
  flagId: "flag-1",
  postingTitle: "Software Engineer",
  open: true,
  onOpenChange: vi.fn(),
  onSuccess: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({}),
  });
});

describe("ResolveFlagModal", () => {
  it("renders the modal when open=true", () => {
    renderWithPortalProviders(<ResolveFlagModal {...BASE_PROPS} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("resolution-action-group")).toBeInTheDocument();
    expect(screen.getByTestId("resolution-note-textarea")).toBeInTheDocument();
  });

  it("does not render when open=false", () => {
    renderWithPortalProviders(<ResolveFlagModal {...BASE_PROPS} open={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("submit button is disabled when form is incomplete", () => {
    renderWithPortalProviders(<ResolveFlagModal {...BASE_PROPS} />);
    expect(screen.getByTestId("resolve-submit-button")).toBeDisabled();
  });

  it("submit enabled after selecting action and filling note", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<ResolveFlagModal {...BASE_PROPS} />);

    await user.click(screen.getByLabelText(/Request changes/));
    await user.type(
      screen.getByTestId("resolution-note-textarea"),
      "Posting requires correction of misleading salary information before resubmission.",
    );

    expect(screen.getByTestId("resolve-submit-button")).not.toBeDisabled();
  });

  it("calls resolve endpoint for request_changes", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<ResolveFlagModal {...BASE_PROPS} />);

    await user.click(screen.getByLabelText(/Request changes/));
    await user.type(
      screen.getByTestId("resolution-note-textarea"),
      "Posting requires correction of misleading salary information before resubmission.",
    );
    await user.click(screen.getByTestId("resolve-submit-button"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/admin/flags/flag-1/resolve",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("request_changes"),
        }),
      );
    });
  });

  it("calls resolve endpoint for reject", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<ResolveFlagModal {...BASE_PROPS} />);

    await user.click(screen.getByLabelText(/Reject posting/));
    await user.type(
      screen.getByTestId("resolution-note-textarea"),
      "Posting is a confirmed scam and must be permanently removed from the platform.",
    );
    await user.click(screen.getByTestId("resolve-submit-button"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/admin/flags/flag-1/resolve",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("reject"),
        }),
      );
    });
  });

  it("calls dismiss endpoint for dismiss action", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<ResolveFlagModal {...BASE_PROPS} />);

    await user.click(screen.getByLabelText(/Dismiss/));
    await user.type(
      screen.getByTestId("resolution-note-textarea"),
      "Upon further review, this was not a genuine policy violation after all.",
    );
    await user.click(screen.getByTestId("resolve-submit-button"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/admin/flags/flag-1/dismiss",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("has no accessibility violations", async () => {
    const { container } = renderWithPortalProviders(<ResolveFlagModal {...BASE_PROPS} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
