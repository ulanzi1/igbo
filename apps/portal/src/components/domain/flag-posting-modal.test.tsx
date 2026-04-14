import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { axe, toHaveNoViolations } from "jest-axe";
import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithPortalProviders, screen, waitFor } from "@/test-utils/render";

// jsdom doesn't implement pointer capture or scrollIntoView — required by Radix UI
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

// Mock Radix Select with native <select>/<option> to avoid CI timeouts.
// Collects options from SelectContent children and renders them inside <select>.
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
    React.Children.forEach(children, (child: unknown) => {
      const el = child as React.ReactElement<Record<string, unknown>> | null;
      if (el?.props?.["data-testid"]) testId = el.props["data-testid"] as string;
    });
    return (
      <select data-testid={testId} value={value} onChange={(e) => onValueChange(e.target.value)}>
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

// Mock Radix RadioGroup with native radio inputs to avoid CI timeouts.
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

import { FlagPostingModal } from "./flag-posting-modal";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

global.fetch = vi.fn();

const BASE_PROPS = {
  postingId: "posting-1",
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

  it("proceed button enabled after all fields filled", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithPortalProviders(<FlagPostingModal {...BASE_PROPS} />);

    // Select category
    fireEvent.change(screen.getByTestId("flag-category-select"), {
      target: { value: "other" },
    });

    // Select severity
    await user.click(screen.getByLabelText(/Low/));

    // Fill description
    await user.type(
      screen.getByTestId("flag-description-textarea"),
      "This posting contains misleading information about the role.",
    );

    expect(screen.getByTestId("flag-proceed-button")).not.toBeDisabled();
  });

  it("shows confirmation step after clicking proceed", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithPortalProviders(<FlagPostingModal {...BASE_PROPS} />);

    fireEvent.change(screen.getByTestId("flag-category-select"), {
      target: { value: "other" },
    });
    await user.click(screen.getByLabelText(/Low/));
    await user.type(
      screen.getByTestId("flag-description-textarea"),
      "This posting contains misleading information about the role.",
    );
    await user.click(screen.getByTestId("flag-proceed-button"));

    expect(screen.getByTestId("flag-confirm-submit")).toBeInTheDocument();
    expect(screen.getByTestId("flag-confirm-back")).toBeInTheDocument();
  });

  it("shows high severity warning in confirm step", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithPortalProviders(<FlagPostingModal {...BASE_PROPS} />);

    fireEvent.change(screen.getByTestId("flag-category-select"), {
      target: { value: "other" },
    });
    await user.click(screen.getByLabelText(/High/));
    await user.type(
      screen.getByTestId("flag-description-textarea"),
      "This posting contains misleading information about the role.",
    );
    await user.click(screen.getByTestId("flag-proceed-button"));

    expect(screen.getByTestId("high-severity-warning")).toBeInTheDocument();
  });

  it("does NOT show high severity warning for low severity", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithPortalProviders(<FlagPostingModal {...BASE_PROPS} />);

    fireEvent.change(screen.getByTestId("flag-category-select"), {
      target: { value: "other" },
    });
    await user.click(screen.getByLabelText(/Low/));
    await user.type(
      screen.getByTestId("flag-description-textarea"),
      "This posting contains misleading information about the role.",
    );
    await user.click(screen.getByTestId("flag-proceed-button"));

    expect(screen.queryByTestId("high-severity-warning")).not.toBeInTheDocument();
  });

  it("submits the flag on confirm", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithPortalProviders(<FlagPostingModal {...BASE_PROPS} />);

    fireEvent.change(screen.getByTestId("flag-category-select"), {
      target: { value: "other" },
    });
    await user.click(screen.getByLabelText(/Low/));
    await user.type(
      screen.getByTestId("flag-description-textarea"),
      "This posting contains misleading information about the role.",
    );
    await user.click(screen.getByTestId("flag-proceed-button"));
    await user.click(screen.getByTestId("flag-confirm-submit"));

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

  it("back button returns to form step", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithPortalProviders(<FlagPostingModal {...BASE_PROPS} />);

    fireEvent.change(screen.getByTestId("flag-category-select"), {
      target: { value: "other" },
    });
    await user.click(screen.getByLabelText(/Low/));
    await user.type(
      screen.getByTestId("flag-description-textarea"),
      "This posting contains misleading information about the role.",
    );
    await user.click(screen.getByTestId("flag-proceed-button"));

    // Go back
    await user.click(screen.getByTestId("flag-confirm-back"));

    // Should be back on form
    expect(screen.getByTestId("flag-description-textarea")).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = renderWithPortalProviders(<FlagPostingModal {...BASE_PROPS} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
