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
  useRouter: () => ({ push: mockPush, refresh: vi.fn() }),
  usePathname: () => "/en/jobs/jp-1",
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, _params?: Record<string, unknown>) => key,
  useFormatter: () => ({
    dateTime: (_date: Date, _opts?: object) => "April 9, 2026 at 10:00 AM",
  }),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    children,
    href,
    onClick,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} onClick={onClick} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type,
    "aria-busy": ariaBusy,
    asChild,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    "aria-busy"?: boolean;
    asChild?: boolean;
  }) => {
    if (asChild && React.isValidElement(children)) {
      // Merge only defined props — mirrors Radix Slot's handler merging behavior.
      // Passing undefined would override the child's own event handlers.
      const mergeProps: Record<string, unknown> = { ...props };
      if (onClick !== undefined) mergeProps.onClick = onClick;
      if (disabled !== undefined) mergeProps.disabled = disabled;
      return React.cloneElement(
        children as React.ReactElement<Record<string, unknown>>,
        mergeProps,
      );
    }
    return (
      <button onClick={onClick} disabled={disabled} type={type} aria-busy={ariaBusy} {...props}>
        {children}
      </button>
    );
  },
}));
vi.mock("@/components/ui/label", () => ({
  Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
}));
vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));
vi.mock("@/components/ui/textarea", () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));
vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/components/ui/card", () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    value?: string;
    onValueChange?: (v: string) => void;
  }) => (
    <select value={value} onChange={(e) => onValueChange?.(e.target.value)} aria-label="Select CV">
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({
    open,
    onOpenChange,
    children,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    children: React.ReactNode;
  }) =>
    open ? (
      <div role="dialog" aria-label="apply-sheet" data-testid="apply-sheet">
        {children}
        <button data-testid="sheet-close-btn" onClick={() => onOpenChange(false)}>
          Close
        </button>
      </div>
    ) : null,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  SheetDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

// Mock ConfirmationCheckmark to keep tests simple
vi.mock("@/components/domain/confirmation-checkmark", () => ({
  ConfirmationCheckmark: () => <div data-testid="confirmation-checkmark" aria-hidden="true" />,
}));

import { ApplicationDrawer } from "./application-drawer";
import type { CvOption } from "@/components/domain/apply-button";

const CV_1: CvOption = {
  id: "cv-1",
  label: "My Resume",
  isDefault: true,
  file: { originalFilename: "resume.pdf" },
};

const CV_2: CvOption = {
  id: "cv-2",
  label: null,
  isDefault: false,
  file: { originalFilename: "cv-old.pdf" },
};

const BASE_PROPS = {
  open: true,
  onOpenChange: vi.fn(),
  jobId: "jp-1",
  jobTitle: "Software Engineer",
  companyName: "Acme Corp",
  cvs: [CV_1, CV_2],
  cvsLoading: false,
  profileHeadline: "Full Stack Developer",
  profileSkills: ["TypeScript", "React"],
  profileLocation: "Lagos, Nigeria",
  enableCoverLetter: false,
  onSuccess: vi.fn(),
};

const mockFetch = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mockFetch);
  vi.stubGlobal("crypto", { randomUUID: () => "test-uuid-1234" });
});

describe("ApplicationDrawer — renders with CVs", () => {
  it("renders sheet title with job title and company", () => {
    render(<ApplicationDrawer {...BASE_PROPS} />);
    expect(screen.getByRole("heading")).toBeInTheDocument();
  });

  it("renders CV selector when CVs are available", () => {
    render(<ApplicationDrawer {...BASE_PROPS} />);
    expect(screen.getByLabelText("Select CV")).toBeInTheDocument();
  });

  it("shows default CV badge", () => {
    render(<ApplicationDrawer {...BASE_PROPS} />);
    expect(screen.getByText("drawer.cvDefaultBadge")).toBeInTheDocument();
  });

  it("submit button is enabled when CVs exist", () => {
    render(<ApplicationDrawer {...BASE_PROPS} />);
    expect(screen.getByRole("button", { name: /drawer.submitButton/i })).not.toBeDisabled();
  });
});

describe("ApplicationDrawer — empty CVs", () => {
  it("shows empty state when no CVs", () => {
    render(<ApplicationDrawer {...BASE_PROPS} cvs={[]} />);
    expect(screen.getByText("drawer.cvEmptyTitle")).toBeInTheDocument();
    expect(screen.getByText("drawer.cvEmptyCta")).toBeInTheDocument();
  });

  it("disables submit button when no CVs", () => {
    render(<ApplicationDrawer {...BASE_PROPS} cvs={[]} />);
    expect(screen.getByRole("button", { name: /drawer.submitButton/i })).toBeDisabled();
  });
});

describe("ApplicationDrawer — cover letter toggle", () => {
  it("does NOT render cover letter textarea when enableCoverLetter=false", () => {
    render(<ApplicationDrawer {...BASE_PROPS} enableCoverLetter={false} />);
    expect(screen.queryByPlaceholderText("drawer.coverLetterPlaceholder")).not.toBeInTheDocument();
  });

  it("renders cover letter textarea when enableCoverLetter=true", () => {
    render(<ApplicationDrawer {...BASE_PROPS} enableCoverLetter={true} />);
    expect(screen.getByPlaceholderText("drawer.coverLetterPlaceholder")).toBeInTheDocument();
  });
});

describe("ApplicationDrawer — portfolio links", () => {
  it("renders initial portfolio link input", () => {
    render(<ApplicationDrawer {...BASE_PROPS} />);
    expect(screen.getByPlaceholderText("drawer.portfolioLinkPlaceholder")).toBeInTheDocument();
  });

  it("shows Add link button", () => {
    render(<ApplicationDrawer {...BASE_PROPS} />);
    expect(screen.getByRole("button", { name: /drawer.portfolioAddLink/i })).toBeInTheDocument();
  });
});

// ── Confirmation panel tests (P-2.5B) ─────────────────────────────────────

describe("ApplicationDrawer — confirmation panel on success (P-2.5B)", () => {
  it("shows confirmation panel after successful submit (stays open)", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: {} }) });

    render(<ApplicationDrawer {...BASE_PROPS} />);
    await user.click(screen.getByRole("button", { name: /drawer.submitButton/i }));

    await waitFor(() => {
      expect(screen.getByText("confirmation.heading")).toBeInTheDocument();
    });
    // Drawer should still be open
    expect(screen.getByTestId("apply-sheet")).toBeInTheDocument();
  });

  it("does NOT call onSuccess immediately on submit success", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: {} }) });

    render(<ApplicationDrawer {...BASE_PROPS} onSuccess={onSuccess} />);
    await user.click(screen.getByRole("button", { name: /drawer.submitButton/i }));

    await waitFor(() => {
      expect(screen.getByText("confirmation.heading")).toBeInTheDocument();
    });
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("calls onSuccess when drawer is closed from confirmed state", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    const onOpenChange = vi.fn();
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: {} }) });

    render(<ApplicationDrawer {...BASE_PROPS} onSuccess={onSuccess} onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole("button", { name: /drawer.submitButton/i }));
    await waitFor(() => {
      expect(screen.getByText("confirmation.heading")).toBeInTheDocument();
    });

    // Close the drawer via the sheet close button
    await user.click(screen.getByTestId("sheet-close-btn"));

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows job title and company name in confirmation panel", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: {} }) });

    render(<ApplicationDrawer {...BASE_PROPS} />);
    await user.click(screen.getByRole("button", { name: /drawer.submitButton/i }));

    await waitFor(() => {
      expect(screen.getByText("confirmation.heading")).toBeInTheDocument();
    });
    // i18n key for jobAt is rendered (in test, the mock returns the key string)
    expect(screen.getByText(/confirmation\.jobAt/)).toBeInTheDocument();
  });

  it("shows submission timestamp in confirmation panel", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: {} }) });

    render(<ApplicationDrawer {...BASE_PROPS} />);
    await user.click(screen.getByRole("button", { name: /drawer.submitButton/i }));

    await waitFor(() => {
      expect(screen.getByText("confirmation.heading")).toBeInTheDocument();
    });
    expect(screen.getByText(/confirmation\.submittedAt/)).toBeInTheDocument();
  });

  it("shows next-steps guidance in confirmation panel", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: {} }) });

    render(<ApplicationDrawer {...BASE_PROPS} />);
    await user.click(screen.getByRole("button", { name: /drawer.submitButton/i }));

    await waitFor(() => {
      expect(screen.getByText("confirmation.heading")).toBeInTheDocument();
    });
    expect(screen.getByText("confirmation.nextSteps")).toBeInTheDocument();
    expect(screen.getByText("confirmation.emailSent")).toBeInTheDocument();
  });

  it("shows View My Applications link in confirmation panel", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: {} }) });

    render(<ApplicationDrawer {...BASE_PROPS} />);
    await user.click(screen.getByRole("button", { name: /drawer.submitButton/i }));

    await waitFor(() => {
      expect(screen.getByText("confirmation.heading")).toBeInTheDocument();
    });
    const link = screen.getByText("confirmation.viewApplications");
    expect(link).toBeInTheDocument();
    expect(link.closest("a")?.getAttribute("href")).toBe("/applications");
  });

  it("Browse More Jobs link navigates to /jobs", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: {} }) });

    render(<ApplicationDrawer {...BASE_PROPS} />);
    await user.click(screen.getByRole("button", { name: /drawer.submitButton/i }));

    await waitFor(() => {
      expect(screen.getByText("confirmation.heading")).toBeInTheDocument();
    });
    const browseLink = screen.getByText("confirmation.browseJobs");
    expect(browseLink.closest("a")?.getAttribute("href")).toBe("/jobs");
  });

  it("Browse More Jobs calls onSuccess for state sync", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: {} }) });

    render(<ApplicationDrawer {...BASE_PROPS} onSuccess={onSuccess} />);
    await user.click(screen.getByRole("button", { name: /drawer.submitButton/i }));

    await waitFor(() => {
      expect(screen.getByText("confirmation.heading")).toBeInTheDocument();
    });
    await user.click(screen.getByText("confirmation.browseJobs"));
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("renders animated checkmark in confirmation panel", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: {} }) });

    render(<ApplicationDrawer {...BASE_PROPS} />);
    await user.click(screen.getByRole("button", { name: /drawer.submitButton/i }));

    await waitFor(() => {
      expect(screen.getByTestId("confirmation-checkmark")).toBeInTheDocument();
    });
  });

  it("confirmation panel has role=status and aria-live=polite", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: {} }) });

    render(<ApplicationDrawer {...BASE_PROPS} />);
    await user.click(screen.getByRole("button", { name: /drawer.submitButton/i }));

    await waitFor(() => {
      const statusEl = screen.getByRole("status");
      expect(statusEl).toBeInTheDocument();
      expect(statusEl.getAttribute("aria-live")).toBe("polite");
    });
  });

  it("does NOT call onSuccess when drawer cancelled (not from confirmed state)", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    render(<ApplicationDrawer {...BASE_PROPS} onSuccess={onSuccess} />);

    // Cancel without submitting
    await user.click(screen.getByRole("button", { name: /drawer.cancelButton/i }));
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

describe("ApplicationDrawer — submit duplicate error (409)", () => {
  it("shows duplicate error banner on 409 DUPLICATE_APPLICATION", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ extensions: { code: "PORTAL_ERRORS.DUPLICATE_APPLICATION" } }),
    });

    render(<ApplicationDrawer {...BASE_PROPS} />);
    await user.click(screen.getByRole("button", { name: /drawer.submitButton/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("errors.duplicate");
    });
  });
});

describe("ApplicationDrawer — cancel button", () => {
  it("calls onOpenChange(false) when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ApplicationDrawer {...BASE_PROPS} onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole("button", { name: /drawer.cancelButton/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("ApplicationDrawer — CV pre-selection (H-1 fix)", () => {
  it("pre-selects default CV when cvs prop is provided", () => {
    render(<ApplicationDrawer {...BASE_PROPS} />);
    const select = screen.getByLabelText("Select CV") as HTMLSelectElement;
    expect(select.value).toBe("cv-1"); // CV_1 is isDefault=true
  });

  it("pre-selects first CV when no default is set", () => {
    const noneDefault: CvOption[] = [
      { ...CV_1, isDefault: false },
      { ...CV_2, isDefault: false },
    ];
    render(<ApplicationDrawer {...BASE_PROPS} cvs={noneDefault} />);
    const select = screen.getByLabelText("Select CV") as HTMLSelectElement;
    expect(select.value).toBe("cv-1"); // first CV selected as fallback
  });
});

describe("ApplicationDrawer — contextual error mapping (H-2 fix)", () => {
  it("shows deadline-passed error when reason is deadline_passed", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      ok: false,
      json: () =>
        Promise.resolve({
          extensions: {
            code: "PORTAL_ERRORS.APPROVAL_INTEGRITY_VIOLATION",
            reason: "deadline_passed",
          },
        }),
    });
    render(<ApplicationDrawer {...BASE_PROPS} />);
    await user.click(screen.getByRole("button", { name: /drawer.submitButton/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("errors.deadlinePassed");
    });
  });

  it("shows posting-filled error when jobStatus is filled", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      ok: false,
      json: () =>
        Promise.resolve({
          extensions: {
            code: "PORTAL_ERRORS.APPROVAL_INTEGRITY_VIOLATION",
            reason: "job_not_active",
            jobStatus: "filled",
          },
        }),
    });
    render(<ApplicationDrawer {...BASE_PROPS} />);
    await user.click(screen.getByRole("button", { name: /drawer.submitButton/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("errors.postingFilled");
    });
  });

  it("shows posting-paused error when jobStatus is paused", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      ok: false,
      json: () =>
        Promise.resolve({
          extensions: {
            code: "PORTAL_ERRORS.APPROVAL_INTEGRITY_VIOLATION",
            reason: "job_not_active",
            jobStatus: "paused",
          },
        }),
    });
    render(<ApplicationDrawer {...BASE_PROPS} />);
    await user.click(screen.getByRole("button", { name: /drawer.submitButton/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("errors.postingPaused");
    });
  });
});

describe("ApplicationDrawer — profile location in preview (H-3 fix)", () => {
  it("renders location in profile preview", () => {
    render(<ApplicationDrawer {...BASE_PROPS} profileLocation="Lagos, Nigeria" />);
    expect(screen.getByText("Lagos, Nigeria")).toBeInTheDocument();
  });

  it("does not render location when null", () => {
    render(<ApplicationDrawer {...BASE_PROPS} profileLocation={null} />);
    expect(screen.queryByText("Lagos, Nigeria")).not.toBeInTheDocument();
  });
});

describe("ApplicationDrawer — Idempotency-Key header", () => {
  it("includes Idempotency-Key header in fetch request", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: {} }) });

    render(<ApplicationDrawer {...BASE_PROPS} />);
    await user.click(screen.getByRole("button", { name: /drawer.submitButton/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/apply"),
        expect.objectContaining({
          headers: expect.objectContaining({ "Idempotency-Key": "test-uuid-1234" }),
        }),
      );
    });
  });
});

describe("ApplicationDrawer — axe accessibility", () => {
  it("has no accessibility violations when open with CVs", async () => {
    const { container } = render(<ApplicationDrawer {...BASE_PROPS} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no accessibility violations on confirmation panel", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: {} }) });
    const { container } = render(<ApplicationDrawer {...BASE_PROPS} />);

    await user.click(screen.getByRole("button", { name: /drawer.submitButton/i }));
    await waitFor(() => {
      expect(screen.getByText("confirmation.heading")).toBeInTheDocument();
    });

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
