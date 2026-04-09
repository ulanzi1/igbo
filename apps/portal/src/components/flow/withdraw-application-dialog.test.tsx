import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

// ─── Polyfills for jsdom + Radix ────────────────────────────────────────────
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

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`;
    return key;
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({
    open,
    children,
  }: {
    open: boolean;
    onOpenChange?: (v: boolean) => void;
    children: React.ReactNode;
  }) => (open ? <div data-testid="alert-dialog">{children}</div> : null),
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="alert-dialog-content">{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" data-testid="withdraw-cancel-button" onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    "aria-busy": ariaBusy,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { "aria-busy"?: boolean }) => (
    <button onClick={onClick} disabled={disabled} aria-busy={ariaBusy} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/textarea", () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
}));

// ─── Imports after mocks ─────────────────────────────────────────────────────
import { toast } from "sonner";
import { WithdrawApplicationDialog } from "./withdraw-application-dialog";

const VALID_APP_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

const BASE_PROPS = {
  applicationId: VALID_APP_ID,
  jobTitle: "Senior Engineer",
  currentStatus: "submitted" as const,
  open: true,
  onOpenChange: vi.fn(),
  onSuccess: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({ data: { applicationId: VALID_APP_ID, status: "withdrawn" } }),
  });
});

describe("WithdrawApplicationDialog — standard flow", () => {
  it("renders dialog title with job title when open", () => {
    render(<WithdrawApplicationDialog {...BASE_PROPS} />);
    expect(screen.getByText('dialogTitle:{"jobTitle":"Senior Engineer"}')).toBeTruthy();
  });

  it("renders dialog description", () => {
    render(<WithdrawApplicationDialog {...BASE_PROPS} />);
    expect(screen.getByText("dialogDescription")).toBeTruthy();
  });

  it("renders reason textarea with label and help text", () => {
    render(<WithdrawApplicationDialog {...BASE_PROPS} />);
    expect(screen.getByLabelText("reasonLabel")).toBeTruthy();
    expect(screen.getByPlaceholderText("reasonPlaceholder")).toBeTruthy();
    expect(screen.getByText("reasonHelp")).toBeTruthy();
  });

  it("does NOT render offered warning or checkbox for non-offered status", () => {
    render(<WithdrawApplicationDialog {...BASE_PROPS} currentStatus="submitted" />);
    expect(screen.queryByText("offeredWarningTitle")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("confirm button is enabled for non-offered status", () => {
    render(<WithdrawApplicationDialog {...BASE_PROPS} />);
    const confirmBtn = screen.getByTestId("withdraw-confirm-button") as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(false);
  });

  it("reason textarea accepts input", async () => {
    const user = userEvent.setup();
    render(<WithdrawApplicationDialog {...BASE_PROPS} />);
    const textarea = screen.getByPlaceholderText("reasonPlaceholder");
    await user.type(textarea, "Changed my mind");
    expect((textarea as HTMLTextAreaElement).value).toBe("Changed my mind");
  });

  it("textarea enforces maxLength=500", () => {
    render(<WithdrawApplicationDialog {...BASE_PROPS} />);
    const textarea = screen.getByPlaceholderText("reasonPlaceholder") as HTMLTextAreaElement;
    expect(textarea.maxLength).toBe(500);
  });

  it("calls fetch with applicationId and reason on confirm", async () => {
    const user = userEvent.setup();
    render(<WithdrawApplicationDialog {...BASE_PROPS} />);
    const textarea = screen.getByPlaceholderText("reasonPlaceholder");
    await user.type(textarea, "Changed my mind");
    await user.click(screen.getByTestId("withdraw-confirm-button"));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/v1/applications/${VALID_APP_ID}/withdraw`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ reason: "Changed my mind" }),
        }),
      );
    });
  });

  it("omits reason from body when textarea is empty", async () => {
    const user = userEvent.setup();
    render(<WithdrawApplicationDialog {...BASE_PROPS} />);
    await user.click(screen.getByTestId("withdraw-confirm-button"));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ body: "{}" }),
      );
    });
  });

  it("calls onSuccess and shows success toast on API success", async () => {
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<WithdrawApplicationDialog {...BASE_PROPS} onSuccess={onSuccess} />);
    await user.click(screen.getByTestId("withdraw-confirm-button"));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("toastSuccess");
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it("closes dialog on success", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<WithdrawApplicationDialog {...BASE_PROPS} onOpenChange={onOpenChange} />);
    await user.click(screen.getByTestId("withdraw-confirm-button"));
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("shows error toast and keeps dialog open on API failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({}),
    });
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<WithdrawApplicationDialog {...BASE_PROPS} onOpenChange={onOpenChange} />);
    await user.click(screen.getByTestId("withdraw-confirm-button"));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
    // Dialog should not be closed
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("maps 409 INVALID_STATUS_TRANSITION to errorInvalidTransition message", async () => {
    // Real API shape: ApiError.toProblemDetails() spreads extensions flat,
    // so the error code is at body.code (NOT body.extensions.code).
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({
        type: "about:blank",
        title: "Invalid status transition",
        status: 409,
        code: "PORTAL_ERRORS.INVALID_STATUS_TRANSITION",
      }),
    });
    const user = userEvent.setup();
    render(<WithdrawApplicationDialog {...BASE_PROPS} />);
    await user.click(screen.getByTestId("withdraw-confirm-button"));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("errorInvalidTransition");
    });
  });

  it("maps 404 NOT_FOUND to errorNotFound message", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({
        type: "about:blank",
        title: "Not Found",
        status: 404,
        code: "PORTAL_ERRORS.NOT_FOUND",
      }),
    });
    const user = userEvent.setup();
    render(<WithdrawApplicationDialog {...BASE_PROPS} />);
    await user.click(screen.getByTestId("withdraw-confirm-button"));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("errorNotFound");
    });
  });

  it("falls back to generic toastError when body has no recognized code", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({
        type: "about:blank",
        title: "Internal Server Error",
        status: 500,
      }),
    });
    const user = userEvent.setup();
    render(<WithdrawApplicationDialog {...BASE_PROPS} />);
    await user.click(screen.getByTestId("withdraw-confirm-button"));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("toastError");
    });
  });

  it("does not render when open=false", () => {
    render(<WithdrawApplicationDialog {...BASE_PROPS} open={false} />);
    expect(screen.queryByTestId("alert-dialog")).toBeNull();
  });

  it("passes axe accessibility check (standard variant)", async () => {
    const { container } = render(<WithdrawApplicationDialog {...BASE_PROPS} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe("WithdrawApplicationDialog — offered flow (AC 3)", () => {
  const offeredProps = { ...BASE_PROPS, currentStatus: "offered" as const };

  it("renders offered warning title and body", () => {
    render(<WithdrawApplicationDialog {...offeredProps} />);
    expect(screen.getByText("offeredWarningTitle")).toBeTruthy();
    expect(screen.getByText("offeredWarningBody")).toBeTruthy();
  });

  it("renders acknowledge checkbox with label", () => {
    render(<WithdrawApplicationDialog {...offeredProps} />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeTruthy();
    expect(screen.getByLabelText("offeredConfirmCheckbox")).toBeTruthy();
  });

  it("confirm button is disabled until checkbox is checked", () => {
    render(<WithdrawApplicationDialog {...offeredProps} />);
    const confirmBtn = screen.getByTestId("withdraw-confirm-button") as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
  });

  it("confirm button enables after checkbox is ticked", async () => {
    const user = userEvent.setup();
    render(<WithdrawApplicationDialog {...offeredProps} />);
    await user.click(screen.getByRole("checkbox"));
    const confirmBtn = screen.getByTestId("withdraw-confirm-button") as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(false);
  });

  it("submits successfully after checking offered ack checkbox", async () => {
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<WithdrawApplicationDialog {...offeredProps} onSuccess={onSuccess} />);
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByTestId("withdraw-confirm-button"));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it("passes axe accessibility check (offered variant)", async () => {
    const { container } = render(<WithdrawApplicationDialog {...offeredProps} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
