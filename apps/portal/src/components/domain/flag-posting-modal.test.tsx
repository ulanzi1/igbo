import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { axe, toHaveNoViolations } from "jest-axe";
import { fireEvent } from "@testing-library/react";
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
  DialogDescription: ({
    children,
    ...rest
  }: {
    children: React.ReactNode;
    [k: string]: unknown;
  }) => <p {...rest}>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock Radix Select with native <select>/<option>.
vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    value: string;
    onValueChange: (v: string) => void;
  }) => {
    let testId: string | undefined;
    let id: string | undefined;
    React.Children.forEach(children, (child: unknown) => {
      const el = child as React.ReactElement<Record<string, unknown>> | null;
      if (el?.props?.["data-testid"]) testId = el.props["data-testid"] as string;
      if (el?.props?.id) id = el.props.id as string;
    });
    return (
      <select
        id={id}
        data-testid={testId}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
      >
        <option value="">--</option>
        {children}
      </select>
    );
  },
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
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

import { FlagPostingModal } from "./flag-posting-modal";

global.fetch = vi.fn();

const BASE_PROPS = {
  postingId: "posting-1",
  postingTitle: "Software Engineer",
  open: true,
  onOpenChange: vi.fn(),
  onSuccess: vi.fn(),
};

const DESCRIPTION = "This posting contains misleading information about the role.";

/** Fill the form: select category, severity, and description via fireEvent (instant). */
function fillForm(severity: string = "low") {
  fireEvent.change(screen.getByTestId("flag-category-select"), {
    target: { value: "other" },
  });
  fireEvent.click(screen.getByLabelText(new RegExp(severity, "i")));
  fireEvent.change(screen.getByTestId("flag-description-textarea"), {
    target: { value: DESCRIPTION },
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

describe("FlagPostingModal", () => {
  it("renders the modal when open=true", () => {
    renderWithPortalProviders(<FlagPostingModal {...BASE_PROPS} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("flag-description-textarea")).toBeInTheDocument();
    expect(screen.getByTestId("flag-severity-group")).toBeInTheDocument();
  });

  it("does not render when open=false", () => {
    renderWithPortalProviders(<FlagPostingModal {...BASE_PROPS} open={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("proceed button is disabled when form is incomplete", () => {
    renderWithPortalProviders(<FlagPostingModal {...BASE_PROPS} />);
    expect(screen.getByTestId("flag-proceed-button")).toBeDisabled();
  });

  it("proceed button enabled after all fields filled", () => {
    renderWithPortalProviders(<FlagPostingModal {...BASE_PROPS} />);
    fillForm();
    expect(screen.getByTestId("flag-proceed-button")).not.toBeDisabled();
  });

  it("shows confirmation step after clicking proceed", () => {
    renderWithPortalProviders(<FlagPostingModal {...BASE_PROPS} />);
    fillForm();
    fireEvent.click(screen.getByTestId("flag-proceed-button"));

    expect(screen.getByTestId("flag-confirm-submit")).toBeInTheDocument();
    expect(screen.getByTestId("flag-confirm-back")).toBeInTheDocument();
  });

  it("shows high severity warning in confirm step", () => {
    renderWithPortalProviders(<FlagPostingModal {...BASE_PROPS} />);
    fillForm("high");
    fireEvent.click(screen.getByTestId("flag-proceed-button"));

    expect(screen.getByTestId("high-severity-warning")).toBeInTheDocument();
  });

  it("does NOT show high severity warning for low severity", () => {
    renderWithPortalProviders(<FlagPostingModal {...BASE_PROPS} />);
    fillForm("low");
    fireEvent.click(screen.getByTestId("flag-proceed-button"));

    expect(screen.queryByTestId("high-severity-warning")).not.toBeInTheDocument();
  });

  it("submits the flag on confirm", async () => {
    renderWithPortalProviders(<FlagPostingModal {...BASE_PROPS} />);
    fillForm();
    fireEvent.click(screen.getByTestId("flag-proceed-button"));
    fireEvent.click(screen.getByTestId("flag-confirm-submit"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/admin/jobs/posting-1/flag",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("other"),
        }),
      );
    });
  });

  it("back button returns to form step", () => {
    renderWithPortalProviders(<FlagPostingModal {...BASE_PROPS} />);
    fillForm();
    fireEvent.click(screen.getByTestId("flag-proceed-button"));
    fireEvent.click(screen.getByTestId("flag-confirm-back"));

    expect(screen.getByTestId("flag-description-textarea")).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = renderWithPortalProviders(<FlagPostingModal {...BASE_PROPS} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
