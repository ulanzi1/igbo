import { describe, it, expect, vi, beforeEach } from "vitest";
import { axe, toHaveNoViolations } from "jest-axe";
import userEvent from "@testing-library/user-event";
import { renderWithPortalProviders, screen, waitFor } from "@/test-utils/render";
import { RequestChangesModal } from "./request-changes-modal";

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

describe("RequestChangesModal", () => {
  it("renders the modal when open=true", () => {
    renderWithPortalProviders(<RequestChangesModal {...BASE_PROPS} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("request-changes-textarea")).toBeInTheDocument();
  });

  it("submit button is disabled when feedback < 20 chars", async () => {
    renderWithPortalProviders(<RequestChangesModal {...BASE_PROPS} />);

    const textarea = screen.getByTestId("request-changes-textarea");
    await userEvent.setup().type(textarea, "Too short");

    expect(screen.getByTestId("request-changes-submit")).toBeDisabled();
  });

  it("submit button is enabled when feedback >= 20 chars", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<RequestChangesModal {...BASE_PROPS} />);

    await user.type(
      screen.getByTestId("request-changes-textarea"),
      "Please add more detail to the job description.",
    );

    expect(screen.getByTestId("request-changes-submit")).not.toBeDisabled();
  });

  it("submits with changes_requested decision on submit", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<RequestChangesModal {...BASE_PROPS} />);

    await user.type(
      screen.getByTestId("request-changes-textarea"),
      "Please add more detail to the job description.",
    );
    await user.click(screen.getByTestId("request-changes-submit"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/admin/jobs/posting-1/review",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            decision: "changes_requested",
            feedbackComment: "Please add more detail to the job description.",
          }),
        }),
      );
    });
  });

  it("has no accessibility violations", async () => {
    const { container } = renderWithPortalProviders(<RequestChangesModal {...BASE_PROPS} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
