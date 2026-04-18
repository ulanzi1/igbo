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
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`;
    return key;
  },
  useLocale: () => "en",
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
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
    onBlur,
    onKeyDown,
    autoFocus,
    ...props
  }: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      autoFocus={autoFocus}
      {...props}
    />
  ),
}));
vi.mock("@/components/ui/select", () => {
  function extractProps(children: React.ReactNode) {
    let testId = "";
    let ariaLabel = "";
    const options: { value: string; label: React.ReactNode }[] = [];
    React.Children.forEach(children, (child) => {
      if (!React.isValidElement(child)) return;
      const displayName = (child.type as { displayName?: string }).displayName ?? "";
      if (displayName === "MockSelectTrigger") {
        testId = (child.props as Record<string, string>)["data-testid"] ?? "";
        ariaLabel = (child.props as Record<string, string>)["aria-label"] ?? "";
      }
      if (displayName === "MockSelectContent") {
        React.Children.forEach((child.props as { children?: React.ReactNode }).children, (item) => {
          if (
            React.isValidElement(item) &&
            (item.type as { displayName?: string }).displayName === "MockSelectItem"
          ) {
            const p = item.props as { value: string; children: React.ReactNode };
            options.push({ value: p.value, label: p.children });
          }
        });
      }
    });
    return { testId, ariaLabel, options };
  }

  const Select = ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: React.ReactNode;
  }) => {
    const { testId, ariaLabel, options } = extractProps(children);
    return (
      <select
        data-testid={testId}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  };
  const SelectTrigger = () => null;
  SelectTrigger.displayName = "MockSelectTrigger";
  const SelectValue = () => null;
  const SelectContent = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  SelectContent.displayName = "MockSelectContent";
  const SelectItem = ({ children }: { value: string; children: React.ReactNode }) => (
    <>{children}</>
  );
  SelectItem.displayName = "MockSelectItem";

  return { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
});
vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <div>{children}</div>,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="alert-dialog-content">{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogAction: ({
    children,
    onClick,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));

import { SavedSearchList } from "./saved-search-list";

const SEARCH_1 = {
  id: "ss-1",
  name: "Lagos Engineers",
  searchParamsJson: { query: "engineer", filters: { location: ["Lagos"] } },
  alertFrequency: "daily" as const,
  lastAlertedAt: "2026-04-10T00:00:00Z",
};
const SEARCH_2 = {
  id: "ss-2",
  name: "Remote Finance",
  searchParamsJson: { filters: { remote: true } },
  alertFrequency: "instant" as const,
  lastAlertedAt: null,
};

function makeListResponse(searches: Record<string, unknown>[]) {
  return new Response(JSON.stringify({ data: { searches } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue(makeListResponse([SEARCH_1, SEARCH_2]));
});

describe("SavedSearchList", () => {
  it("renders list of saved searches", async () => {
    render(<SavedSearchList />);
    await waitFor(() => {
      expect(screen.getByTestId("saved-search-item-ss-1")).toBeDefined();
      expect(screen.getByTestId("saved-search-item-ss-2")).toBeDefined();
    });
  });

  it("shows empty state when no searches", async () => {
    global.fetch = vi.fn().mockResolvedValue(makeListResponse([]));
    render(<SavedSearchList />);
    await waitFor(() => {
      expect(screen.getByTestId("saved-search-empty")).toBeDefined();
    });
  });

  it("shows loading state initially", () => {
    global.fetch = vi.fn().mockResolvedValue(new Promise(() => {}));
    render(<SavedSearchList />);
    expect(screen.getByTestId("saved-search-loading")).toBeDefined();
  });

  it("shows params summary for each search", async () => {
    render(<SavedSearchList />);
    await waitFor(() => {
      // Search 1 has query + 1 location filter
      expect(screen.getByTestId("params-summary-ss-1")).toBeDefined();
    });
  });

  it("shows last alerted date when present", async () => {
    render(<SavedSearchList />);
    await waitFor(() => {
      expect(screen.getByTestId("last-alerted-ss-1").textContent).toContain("lastAlerted");
    });
  });

  it("shows never alerted when lastAlertedAt is null", async () => {
    render(<SavedSearchList />);
    await waitFor(() => {
      expect(screen.getByTestId("last-alerted-ss-2").textContent).toBe("neverAlerted");
    });
  });

  it("rename inline edit — submits on blur", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(makeListResponse([SEARCH_1]))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    const user = userEvent.setup();
    render(<SavedSearchList />);
    await waitFor(() => screen.getByTestId("rename-button-ss-1"));

    await user.click(screen.getByTestId("rename-button-ss-1"));
    const input = screen.getByTestId("rename-input-ss-1") as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "New Name");
    await user.tab(); // trigger blur

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/saved-searches/ss-1",
        expect.objectContaining({ method: "PATCH" }),
      );
    });
  });

  it("frequency change calls PATCH API", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(makeListResponse([SEARCH_1]))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    const user = userEvent.setup();
    render(<SavedSearchList />);
    await waitFor(() => screen.getByTestId("frequency-select-ss-1"));

    const select = screen.getByTestId("frequency-select-ss-1") as HTMLSelectElement;
    await user.selectOptions(select, "instant");

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/saved-searches/ss-1",
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining('"alertFrequency":"instant"'),
        }),
      );
    });
  });

  it("delete with confirmation calls DELETE API", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(makeListResponse([SEARCH_1]))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    const user = userEvent.setup();
    render(<SavedSearchList />);
    await waitFor(() => screen.getByTestId("delete-button-ss-1"));

    await user.click(screen.getByTestId("delete-button-ss-1"));
    await user.click(screen.getByTestId("confirm-delete-ss-1"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/saved-searches/ss-1",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  it("load search navigates to /search with serialized params", async () => {
    const user = userEvent.setup();
    render(<SavedSearchList />);
    await waitFor(() => screen.getByTestId("load-search-ss-1"));

    await user.click(screen.getByTestId("load-search-ss-1"));

    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("/en/search"));
  });

  it("has no axe accessibility violations", async () => {
    const { container } = render(<SavedSearchList />);
    await waitFor(() => screen.getByTestId("saved-search-list"));
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
