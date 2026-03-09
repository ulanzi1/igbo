import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ReportDialog } from "./ReportDialog";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string) => `${ns}.${key}`,
}));

// Mock @tanstack/react-query
const mockMutate = vi.fn();
let mockIsPending = false;
let mockOnSuccess: ((data: unknown) => void) | undefined;

vi.mock("@tanstack/react-query", () => ({
  useMutation: vi.fn(({ onSuccess }: { onSuccess?: (data: unknown) => void }) => {
    mockOnSuccess = onSuccess;
    return { mutate: mockMutate, isPending: mockIsPending };
  }),
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

const defaultProps = {
  contentType: "post" as const,
  contentId: "post-123",
  onClose: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockIsPending = false;
  mockOnSuccess = undefined;
});

describe("ReportDialog", () => {
  it("renders title and description", () => {
    render(<ReportDialog {...defaultProps} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reports.dialog.title" })).toBeInTheDocument();
    expect(screen.getByText("Reports.dialog.description")).toBeInTheDocument();
  });

  it("renders all reason category radio buttons", () => {
    render(<ReportDialog {...defaultProps} />);
    expect(screen.getByText("Reports.reason.harassment")).toBeInTheDocument();
    expect(screen.getByText("Reports.reason.spam")).toBeInTheDocument();
    expect(screen.getByText("Reports.reason.inappropriateContent")).toBeInTheDocument();
    expect(screen.getByText("Reports.reason.misinformation")).toBeInTheDocument();
    expect(screen.getByText("Reports.reason.impersonation")).toBeInTheDocument();
    expect(screen.getByText("Reports.reason.other")).toBeInTheDocument();
  });

  it("shows free-text textarea when 'other' is selected", () => {
    render(<ReportDialog {...defaultProps} />);
    const otherRadio = screen.getByDisplayValue("other");
    fireEvent.click(otherRadio);
    expect(screen.getByPlaceholderText("Reports.reason.otherPlaceholder")).toBeInTheDocument();
  });

  it("does NOT show free-text textarea for non-other reasons", () => {
    render(<ReportDialog {...defaultProps} />);
    expect(
      screen.queryByPlaceholderText("Reports.reason.otherPlaceholder"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByDisplayValue("harassment"));
    expect(
      screen.queryByPlaceholderText("Reports.reason.otherPlaceholder"),
    ).not.toBeInTheDocument();
  });

  it("submit button is disabled until a reason is selected", () => {
    render(<ReportDialog {...defaultProps} />);
    const submitBtn = screen.getByRole("button", { name: "Reports.submit" });
    expect(submitBtn).toBeDisabled();

    fireEvent.click(screen.getByDisplayValue("spam"));
    expect(submitBtn).not.toBeDisabled();
  });

  it("calls mutation on form submit", () => {
    render(<ReportDialog {...defaultProps} />);
    fireEvent.click(screen.getByDisplayValue("harassment"));
    fireEvent.submit(screen.getByRole("button", { name: "Reports.submit" }).closest("form")!);
    expect(mockMutate).toHaveBeenCalled();
  });

  it("shows loading text when pending", () => {
    mockIsPending = true;
    render(<ReportDialog {...defaultProps} />);
    fireEvent.click(screen.getByDisplayValue("spam"));
    expect(screen.getByRole("button", { name: "Reports.submitting" })).toBeInTheDocument();
  });

  it("shows success message after successful submission with Close button", async () => {
    render(<ReportDialog {...defaultProps} />);
    fireEvent.click(screen.getByDisplayValue("spam"));

    // Trigger onSuccess with non-alreadyReported result
    mockOnSuccess?.({ data: { reportId: "rpt-1" } });

    await waitFor(() => {
      expect(screen.getByText("Reports.success")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Reports.close" })).toBeInTheDocument();
    });
  });

  it("shows alreadyReported message when duplicate with Close button", async () => {
    render(<ReportDialog {...defaultProps} />);
    fireEvent.click(screen.getByDisplayValue("spam"));

    mockOnSuccess?.({ data: { alreadyReported: true } });

    await waitFor(() => {
      expect(screen.getByText("Reports.alreadyReported")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Reports.close" })).toBeInTheDocument();
    });
  });

  it("calls onClose when clicking outside (backdrop click)", () => {
    render(<ReportDialog {...defaultProps} />);
    const backdrop = screen.getByRole("dialog");
    fireEvent.click(backdrop);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("closes on Escape key", () => {
    render(<ReportDialog {...defaultProps} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});
