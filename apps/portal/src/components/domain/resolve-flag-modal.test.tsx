import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { axe, toHaveNoViolations } from "jest-axe";
import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithPortalProviders, screen, waitFor } from "@/test-utils/render";

expect.extend(toHaveNoViolations);

// Mock Radix Dialog to avoid scroll-lock / pointer-events:none on <body> in jsdom.
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog-wrapper">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div role="dialog" aria-labelledby="dialog-title">
      {children}
    </div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2 id="dialog-title">{children}</h2>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock Radix RadioGroup with native radio inputs.
vi.mock("@/components/ui/radio-group", () => ({
  RadioGroup: ({
    children,
    value: _value,
    onValueChange,
    ...rest
  }: {
    children: React.ReactNode;
    value: string;
    onValueChange: (v: string) => void;
    [key: string]: unknown;
  }) => (
    <div
      role="radiogroup"
      {...rest}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => onValueChange(e.target.value)}
    >
      {children}
    </div>
  ),
  RadioGroupItem: ({ value, id }: { value: string; id: string }) => (
    <input type="radio" name="radio-group" value={value} id={id} />
  ),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { ResolveFlagModal } from "./resolve-flag-modal";

global.fetch = vi.fn();

const BASE_PROPS = {
  flagId: "flag-1",
  postingTitle: "Software Engineer",
  open: true,
  onOpenChange: vi.fn(),
  onSuccess: vi.fn(),
};

const LONG_NOTE =
  "Posting requires correction of misleading salary information before resubmission.";

/** Helper: fill the textarea via fireEvent.change (instant, no per-char events). */
function fillNote(text: string = LONG_NOTE) {
  fireEvent.change(screen.getByTestId("resolution-note-textarea"), {
    target: { value: text },
  });
}

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
    fillNote();

    expect(screen.getByTestId("resolve-submit-button")).not.toBeDisabled();
  });

  it("calls resolve endpoint for request_changes", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<ResolveFlagModal {...BASE_PROPS} />);

    await user.click(screen.getByLabelText(/Request changes/));
    fillNote();
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
    fillNote("Posting is a confirmed scam and must be permanently removed from the platform.");
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
    fillNote("Upon further review, this was not a genuine policy violation after all.");
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
