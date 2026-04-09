import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ─── Polyfills ───────────────────────────────────────────────────────────────
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  setPointerCapture: () => undefined,
  releasePointerCapture: () => undefined,
  scrollIntoView: () => undefined,
});

// ─── Mocks ───────────────────────────────────────────────────────────────────
const mockRefresh = vi.fn();

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

// Mock the dialog to keep this test focused on the controls wrapper
const mockDialogOnOpenChange = vi.fn();
vi.mock("@/components/flow/withdraw-application-dialog", () => ({
  WithdrawApplicationDialog: ({
    open,
    onOpenChange,
    onSuccess,
  }: {
    applicationId: string;
    jobTitle: string;
    currentStatus: string;
    open: boolean;
    onOpenChange: (v: boolean) => void;
    onSuccess: () => void;
  }) => {
    mockDialogOnOpenChange.mockImplementation(onOpenChange);
    return open ? (
      <div data-testid="withdraw-dialog">
        <button data-testid="dialog-success-btn" onClick={onSuccess}>
          Success
        </button>
        <button data-testid="dialog-close-btn" onClick={() => onOpenChange(false)}>
          Close
        </button>
      </div>
    ) : null;
  },
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────
import { WithdrawApplicationControls } from "./withdraw-application-controls";

const BASE_PROPS = {
  applicationId: "app-1",
  jobTitle: "Senior Engineer",
  currentStatus: "submitted" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WithdrawApplicationControls", () => {
  it("renders the trigger button with i18n label", () => {
    render(<WithdrawApplicationControls {...BASE_PROPS} />);
    expect(screen.getByTestId("withdraw-trigger-button")).toBeTruthy();
    expect(screen.getByText("buttonLabel")).toBeTruthy();
  });

  it("dialog is not visible initially", () => {
    render(<WithdrawApplicationControls {...BASE_PROPS} />);
    expect(screen.queryByTestId("withdraw-dialog")).toBeNull();
  });

  it("clicking trigger button opens the dialog", async () => {
    const user = userEvent.setup();
    render(<WithdrawApplicationControls {...BASE_PROPS} />);
    await user.click(screen.getByTestId("withdraw-trigger-button"));
    expect(screen.getByTestId("withdraw-dialog")).toBeTruthy();
  });

  it("onSuccess calls router.refresh()", async () => {
    const user = userEvent.setup();
    render(<WithdrawApplicationControls {...BASE_PROPS} />);
    await user.click(screen.getByTestId("withdraw-trigger-button"));
    await user.click(screen.getByTestId("dialog-success-btn"));
    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it("dialog closes when onOpenChange(false) is called", async () => {
    const user = userEvent.setup();
    render(<WithdrawApplicationControls {...BASE_PROPS} />);
    await user.click(screen.getByTestId("withdraw-trigger-button"));
    expect(screen.getByTestId("withdraw-dialog")).toBeTruthy();
    await user.click(screen.getByTestId("dialog-close-btn"));
    await waitFor(() => {
      expect(screen.queryByTestId("withdraw-dialog")).toBeNull();
    });
  });
});
