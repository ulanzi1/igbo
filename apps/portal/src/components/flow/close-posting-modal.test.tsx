import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// RadioGroup mock: captures onValueChange via bubbling click on items with data-value attribute
vi.mock("@/components/ui/radio-group", () => ({
  RadioGroup: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    value: string;
    onValueChange: (v: string) => void;
  }) => (
    <div
      data-testid="radio-group"
      data-value={value}
      onClick={(e: React.MouseEvent) => {
        const target = (e.target as HTMLElement).closest("[data-value]");
        if (target && target !== e.currentTarget) {
          const val = target.getAttribute("data-value");
          if (val) onValueChange(val);
        }
      }}
    >
      {children}
    </div>
  ),
  RadioGroupItem: ({ value, id }: { value: string; id: string }) => (
    <input
      type="radio"
      id={id}
      value={value}
      data-value={value}
      data-testid={`radio-${value}`}
      onChange={() => {}}
    />
  ),
}));

import React from "react";
import { toast } from "sonner";
import { ClosePostingModal } from "./close-posting-modal";

const defaultProps = {
  postingId: "posting-uuid",
  open: true,
  onOpenChange: vi.fn(),
  onSuccess: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({}),
  });
});

describe("ClosePostingModal", () => {
  it("renders 3 radio options when open", () => {
    render(<ClosePostingModal {...defaultProps} />);
    expect(screen.getByTestId("radio-filled_via_portal")).toBeTruthy();
    expect(screen.getByTestId("radio-filled_internally")).toBeTruthy();
    expect(screen.getByTestId("radio-cancelled")).toBeTruthy();
  });

  it("renders radio labels with i18n keys", () => {
    render(<ClosePostingModal {...defaultProps} />);
    expect(screen.getByText("closedOutcome.filled_via_portal")).toBeTruthy();
    expect(screen.getByText("closedOutcome.filled_internally")).toBeTruthy();
    expect(screen.getByText("closedOutcome.cancelled")).toBeTruthy();
  });

  it("confirm button is disabled before any option is selected", () => {
    render(<ClosePostingModal {...defaultProps} />);
    const confirmBtn = screen.getByTestId("confirm-close-button") as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
  });

  it("confirm button is enabled after selecting an option", async () => {
    const user = userEvent.setup();
    render(<ClosePostingModal {...defaultProps} />);
    await user.click(screen.getByTestId("radio-filled_via_portal"));
    const confirmBtn = screen.getByTestId("confirm-close-button") as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(false);
  });

  it("calls fetch with targetStatus=filled and selected closedOutcome on confirm", async () => {
    const user = userEvent.setup();
    render(<ClosePostingModal {...defaultProps} />);
    await user.click(screen.getByTestId("radio-filled_via_portal"));
    await user.click(screen.getByTestId("confirm-close-button"));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/jobs/posting-uuid/status",
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining('"targetStatus":"filled"'),
        }),
      );
    });
    const callBody = JSON.parse(
      (vi.mocked(global.fetch).mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(callBody.closedOutcome).toBe("filled_via_portal");
  });

  it("calls onSuccess and shows success toast on successful close", async () => {
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<ClosePostingModal {...defaultProps} onSuccess={onSuccess} />);
    await user.click(screen.getByTestId("radio-cancelled"));
    await user.click(screen.getByTestId("confirm-close-button"));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it("shows error toast when API call fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });
    const user = userEvent.setup();
    render(<ClosePostingModal {...defaultProps} />);
    await user.click(screen.getByTestId("radio-cancelled"));
    await user.click(screen.getByTestId("confirm-close-button"));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });

  it("does not render dialog content when open=false", () => {
    render(<ClosePostingModal {...defaultProps} open={false} />);
    expect(screen.queryByTestId("dialog")).toBeNull();
  });

  it("passes axe accessibility check when open", async () => {
    const { container } = render(<ClosePostingModal {...defaultProps} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
