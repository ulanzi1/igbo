import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { ExtendPostingModal } from "./extend-posting-modal";

const messages = {
  Portal: {
    lifecycle: {
      cancel: "Cancel",
      staleEditError: "This posting was modified. Please reload and try again.",
    },
    expiry: {
      extendPosting: "Extend Job Posting",
      extendDescription: "Set a new expiry date to re-activate this posting",
      newExpiryDate: "New Expiry Date",
      extend: "Extend",
      extendSuccess: "Posting extended and re-activated",
      mustBeFutureDate: "Expiry date must be in the future",
    },
  },
};

function renderModal(props?: Partial<Parameters<typeof ExtendPostingModal>[0]>) {
  const defaultProps = {
    postingId: "posting-uuid",
    open: true,
    onOpenChange: vi.fn(),
    onSuccess: vi.fn(),
  };
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ExtendPostingModal {...defaultProps} {...props} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  global.fetch = vi.fn();
});

describe("ExtendPostingModal", () => {
  it("renders the date input and extend button when open", () => {
    renderModal();
    expect(screen.getByTestId("new-expires-at-input")).toBeInTheDocument();
    expect(screen.getByTestId("extend-confirm-button")).toBeInTheDocument();
    expect(screen.getByText("Extend Job Posting")).toBeInTheDocument();
  });

  it("shows validation error when no date is provided", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByTestId("extend-confirm-button"));
    expect(screen.getByRole("alert")).toHaveTextContent("Expiry date must be in the future");
  });

  it("shows validation error when date is in the past", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.type(screen.getByTestId("new-expires-at-input"), "2020-01-01");
    await user.click(screen.getByTestId("extend-confirm-button"));
    expect(screen.getByRole("alert")).toHaveTextContent("Expiry date must be in the future");
  });

  it("calls API with correct body on valid future date", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ data: { status: "active" } }), { status: 200 }),
    );
    renderModal();
    // Use a date far in the future
    const futureDate = "2099-12-31";
    await user.type(screen.getByTestId("new-expires-at-input"), futureDate);
    await user.click(screen.getByTestId("extend-confirm-button"));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/jobs/posting-uuid/status",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining('"targetStatus":"active"'),
      }),
    );
    const callBody = JSON.parse(
      (vi.mocked(global.fetch).mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(callBody.contentChanged).toBe(false);
    expect(callBody.targetStatus).toBe("active");
  });

  it("calls onSuccess and closes modal on successful API response", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    const onOpenChange = vi.fn();
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ data: { status: "active" } }), { status: 200 }),
    );
    renderModal({ onSuccess, onOpenChange });
    await user.type(screen.getByTestId("new-expires-at-input"), "2099-12-31");
    await user.click(screen.getByTestId("extend-confirm-button"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSuccess).toHaveBeenCalled();
  });

  it("does not render modal content when open=false", () => {
    renderModal({ open: false });
    expect(screen.queryByTestId("new-expires-at-input")).not.toBeInTheDocument();
  });
});
