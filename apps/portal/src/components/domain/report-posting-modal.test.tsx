import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { axe, toHaveNoViolations } from "jest-axe";
import { fireEvent, waitFor } from "@testing-library/react";
import { renderWithPortalProviders, screen } from "@/test-utils/render";

expect.extend(toHaveNoViolations);

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

vi.mock("@/components/ui/radio-group", () => ({
  RadioGroup: ({
    children,
    onValueChange,
    ...rest
  }: {
    children: React.ReactNode;
    value: string;
    onValueChange: (v: string) => void;
    [k: string]: unknown;
  }) => (
    <div
      role="radiogroup"
      data-testid={rest["data-testid"] as string}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => onValueChange(e.target.value)}
    >
      {children}
    </div>
  ),
  RadioGroupItem: ({ value, id, ...rest }: { value: string; id: string; [k: string]: unknown }) => (
    <input
      type="radio"
      name="report-category"
      value={value}
      id={id}
      data-testid={rest["data-testid"] as string}
    />
  ),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from "sonner";
import { ReportPostingModal } from "./report-posting-modal";

global.fetch = vi.fn();

const BASE_PROPS = {
  postingId: "posting-1",
  postingTitle: "Software Engineer",
  open: true,
  onOpenChange: vi.fn(),
  onSuccess: vi.fn(),
};

const DESCRIPTION = "This posting appears to be a scam with unrealistic salary claims.";

function fillForm() {
  fireEvent.click(screen.getByTestId("report-category-scam_fraud"));
  fireEvent.change(screen.getByTestId("report-description-textarea"), {
    target: { value: DESCRIPTION },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    status: 201,
    json: vi.fn().mockResolvedValue({}),
  });
});

describe("ReportPostingModal", () => {
  it("renders when open", () => {
    renderWithPortalProviders(<ReportPostingModal {...BASE_PROPS} />);
    expect(screen.getByTestId("dialog-wrapper")).toBeDefined();
  });

  it("does not render when closed", () => {
    renderWithPortalProviders(<ReportPostingModal {...BASE_PROPS} open={false} />);
    expect(screen.queryByTestId("dialog-wrapper")).toBeNull();
  });

  it("proceed button is disabled when form is incomplete", () => {
    renderWithPortalProviders(<ReportPostingModal {...BASE_PROPS} />);
    const btn = screen.getByTestId("report-proceed-button");
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("proceed button is enabled when category and long enough description are set", () => {
    renderWithPortalProviders(<ReportPostingModal {...BASE_PROPS} />);
    fillForm();
    const btn = screen.getByTestId("report-proceed-button");
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows confirm step after clicking proceed", () => {
    renderWithPortalProviders(<ReportPostingModal {...BASE_PROPS} />);
    fillForm();
    fireEvent.click(screen.getByTestId("report-proceed-button"));
    expect(screen.getByTestId("confirm-category-badge")).toBeDefined();
    expect(screen.getByTestId("report-confirm-submit")).toBeDefined();
  });

  it("submits the form and calls onSuccess on success", async () => {
    renderWithPortalProviders(<ReportPostingModal {...BASE_PROPS} />);
    fillForm();
    fireEvent.click(screen.getByTestId("report-proceed-button"));
    fireEvent.click(screen.getByTestId("report-confirm-submit"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/reports/postings/posting-1",
        expect.objectContaining({ method: "POST" }),
      );
      expect(BASE_PROPS.onSuccess).toHaveBeenCalled();
    });
  });

  it("shows error toast on 409 (already reported)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 409 });
    renderWithPortalProviders(<ReportPostingModal {...BASE_PROPS} />);
    fillForm();
    fireEvent.click(screen.getByTestId("report-proceed-button"));
    fireEvent.click(screen.getByTestId("report-confirm-submit"));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });

  it("can go back from confirm step", () => {
    renderWithPortalProviders(<ReportPostingModal {...BASE_PROPS} />);
    fillForm();
    fireEvent.click(screen.getByTestId("report-proceed-button"));
    fireEvent.click(screen.getByTestId("report-confirm-back"));
    expect(screen.getByTestId("report-proceed-button")).toBeDefined();
  });

  it("has no accessibility violations", async () => {
    const { container } = renderWithPortalProviders(<ReportPostingModal {...BASE_PROPS} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
