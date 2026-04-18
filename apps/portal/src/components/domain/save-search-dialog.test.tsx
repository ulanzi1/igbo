import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

// ─── Polyfills ──────────────────────────────────────────────────────────────
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
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
vi.mock("@/components/ui/input", () => ({
  Input: ({
    value,
    onChange,
    placeholder,
    ...props
  }: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input value={value} onChange={onChange} placeholder={placeholder} {...props} />
  ),
}));
vi.mock("@/components/ui/label", () => ({
  Label: ({ children, htmlFor, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
    <label htmlFor={htmlFor} {...props}>
      {children}
    </label>
  ),
}));
vi.mock("@/components/ui/radio-group", () => ({
  RadioGroup: ({
    value,
    onValueChange,
    children,
    ...props
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <div role="radiogroup" {...props}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(
            child as React.ReactElement<{
              _groupValue?: string;
              _onGroupChange?: (v: string) => void;
            }>,
            {
              _groupValue: value,
              _onGroupChange: onValueChange,
            },
          );
        }
        return child;
      })}
    </div>
  ),
  RadioGroupItem: ({
    value,
    id,
    _groupValue,
    _onGroupChange,
    ...props
  }: {
    value: string;
    id: string;
    _groupValue?: string;
    _onGroupChange?: (v: string) => void;
    [key: string]: unknown;
  }) => (
    <input
      type="radio"
      id={id}
      value={value}
      checked={_groupValue === value}
      onChange={() => _onGroupChange?.(value)}
      {...props}
    />
  ),
}));

import { SaveSearchDialog } from "./save-search-dialog";
import { DEFAULT_SEARCH_STATE } from "@/lib/search-url-params";
import { toast } from "sonner";

const SEARCH_WITH_QUERY = { ...DEFAULT_SEARCH_STATE, q: "engineer" };
const SEARCH_WITH_FILTERS = {
  ...DEFAULT_SEARCH_STATE,
  location: ["Lagos"],
  employmentType: ["full_time"] as typeof DEFAULT_SEARCH_STATE.employmentType,
};

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  searchParams: SEARCH_WITH_QUERY,
  onSaved: vi.fn(),
  savedSearchCount: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ data: { search: {} } }), { status: 201 }));
});

describe("SaveSearchDialog", () => {
  it("renders dialog with search params preview", () => {
    render(<SaveSearchDialog {...defaultProps} />);
    expect(screen.getByTestId("dialog")).toBeDefined();
    expect(screen.getByTestId("params-preview")).toBeDefined();
    const preview = screen.getByTestId("params-preview").textContent;
    expect(preview).toContain("paramsQueryOnly");
  });

  it("shows filter count in preview when filters are active", () => {
    render(<SaveSearchDialog {...defaultProps} searchParams={SEARCH_WITH_FILTERS} />);
    const preview = screen.getByTestId("params-preview").textContent ?? "";
    expect(preview).toContain("paramsNoQuery");
    expect(preview).toContain("2"); // location + employmentType = 2 filters
  });

  it("name input starts empty", () => {
    render(<SaveSearchDialog {...defaultProps} />);
    const input = screen.getByTestId("save-search-name-input") as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("frequency selection sends selected frequency to API", async () => {
    const user = userEvent.setup();
    render(<SaveSearchDialog {...defaultProps} />);

    // daily is default — verify daily is sent without changing
    const saveBtn = screen.getByTestId("save-button");
    await user.click(saveBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/saved-searches",
        expect.objectContaining({
          body: expect.stringContaining('"alertFrequency":"daily"'),
        }),
      );
    });
  });

  it("save calls API with correct payload", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const onOpenChange = vi.fn();
    render(<SaveSearchDialog {...defaultProps} onSaved={onSaved} onOpenChange={onOpenChange} />);

    const nameInput = screen.getByTestId("save-search-name-input");
    await user.type(nameInput, "My Search");

    const saveBtn = screen.getByTestId("save-button");
    await user.click(saveBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/saved-searches",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"name":"My Search"'),
        }),
      );
    });
    expect(toast.success).toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("cancel button closes dialog", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<SaveSearchDialog {...defaultProps} onOpenChange={onOpenChange} />);

    await user.click(screen.getByTestId("cancel-button"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("disabled when max searches reached", () => {
    render(<SaveSearchDialog {...defaultProps} savedSearchCount={10} />);

    const saveBtn = screen.getByTestId("save-button") as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);

    const nameInput = screen.getByTestId("save-search-name-input") as HTMLInputElement;
    expect(nameInput.disabled).toBe(true);
  });

  it("shows error toast on non-ok response", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 409 }));
    const user = userEvent.setup();
    render(<SaveSearchDialog {...defaultProps} />);

    await user.click(screen.getByTestId("save-button"));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });

  it("has no axe accessibility violations", async () => {
    const { container } = render(<SaveSearchDialog {...defaultProps} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
