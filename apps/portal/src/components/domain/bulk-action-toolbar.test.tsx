// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import React from "react";
import { axe, toHaveNoViolations } from "jest-axe";
import userEvent from "@testing-library/user-event";
import { renderWithPortalProviders, screen, waitFor } from "@/test-utils/render";
import { BulkActionToolbar } from "./bulk-action-toolbar";

expect.extend(toHaveNoViolations);

// Radix Dialog needs pointer-capture + ResizeObserver polyfills in jsdom
beforeAll(() => {
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
});

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { toast } from "sonner";

const IDS = ["a1111111-1111-4111-a111-111111111111", "a2222222-2222-4222-a222-222222222222"];

function mockFetch(status: number, body: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BulkActionToolbar", () => {
  it("renders with selected count and action buttons", () => {
    renderWithPortalProviders(
      <BulkActionToolbar
        selectedCount={2}
        applicationIds={IDS}
        onBulkComplete={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByRole("toolbar")).toBeInTheDocument();
    expect(screen.getByTestId("bulk-selected-count")).toHaveTextContent("2 selected");
    expect(screen.getByTestId("bulk-advance-button")).toBeInTheDocument();
    expect(screen.getByTestId("bulk-reject-button")).toBeInTheDocument();
    expect(screen.getByTestId("bulk-message-button")).toBeDisabled();
  });

  it("calls onClear when Clear button is clicked", async () => {
    const onClear = vi.fn();
    const user = userEvent.setup();
    renderWithPortalProviders(
      <BulkActionToolbar
        selectedCount={2}
        applicationIds={IDS}
        onBulkComplete={vi.fn()}
        onClear={onClear}
      />,
    );
    await user.click(screen.getByTestId("bulk-clear-button"));
    expect(onClear).toHaveBeenCalled();
  });

  it("calls bulk PATCH with advance action and shows success toast", async () => {
    mockFetch(200, { data: { processed: 2, skipped: 0, results: [] } });
    const onBulkComplete = vi.fn();
    const user = userEvent.setup();

    renderWithPortalProviders(
      <BulkActionToolbar
        selectedCount={2}
        applicationIds={IDS}
        onBulkComplete={onBulkComplete}
        onClear={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("bulk-advance-button"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/applications/bulk/status",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ applicationIds: IDS, action: "advance" }),
        }),
      );
      expect(toast.success).toHaveBeenCalled();
      expect(onBulkComplete).toHaveBeenCalled();
    });
  });

  it("shows error toast when bulk advance fails", async () => {
    mockFetch(500, { title: "Internal Server Error" });
    const user = userEvent.setup();
    renderWithPortalProviders(
      <BulkActionToolbar
        selectedCount={2}
        applicationIds={IDS}
        onBulkComplete={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId("bulk-advance-button"));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });

  it("opens confirmation modal when Reject is clicked", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(
      <BulkActionToolbar
        selectedCount={2}
        applicationIds={IDS}
        onBulkComplete={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId("bulk-reject-button"));
    expect(await screen.findByTestId("bulk-reject-modal")).toBeInTheDocument();
    expect(screen.getByText(/Reject 2 applications/)).toBeInTheDocument();
  });

  it("closes modal on Cancel without calling fetch", async () => {
    global.fetch = vi.fn();
    const user = userEvent.setup();
    renderWithPortalProviders(
      <BulkActionToolbar
        selectedCount={2}
        applicationIds={IDS}
        onBulkComplete={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId("bulk-reject-button"));
    await screen.findByTestId("bulk-reject-modal");
    await user.click(screen.getByTestId("bulk-reject-cancel"));
    await waitFor(() => {
      expect(screen.queryByTestId("bulk-reject-modal")).not.toBeInTheDocument();
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("confirms reject and passes reason to API", async () => {
    mockFetch(200, { data: { processed: 2, skipped: 0, results: [] } });
    const onBulkComplete = vi.fn();
    const user = userEvent.setup();

    renderWithPortalProviders(
      <BulkActionToolbar
        selectedCount={2}
        applicationIds={IDS}
        onBulkComplete={onBulkComplete}
        onClear={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("bulk-reject-button"));
    await screen.findByTestId("bulk-reject-modal");

    const textarea = screen.getByTestId("bulk-reject-reason");
    await user.type(textarea, "Position filled");
    await user.click(screen.getByTestId("bulk-reject-confirm"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/applications/bulk/status",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            applicationIds: IDS,
            action: "reject",
            reason: "Position filled",
          }),
        }),
      );
      expect(toast.success).toHaveBeenCalled();
      expect(onBulkComplete).toHaveBeenCalled();
    });
  });

  it("confirms reject without reason when left blank", async () => {
    mockFetch(200, { data: { processed: 2, skipped: 0, results: [] } });
    const user = userEvent.setup();

    renderWithPortalProviders(
      <BulkActionToolbar
        selectedCount={2}
        applicationIds={IDS}
        onBulkComplete={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("bulk-reject-button"));
    await screen.findByTestId("bulk-reject-modal");
    await user.click(screen.getByTestId("bulk-reject-confirm"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/applications/bulk/status",
        expect.objectContaining({
          body: JSON.stringify({ applicationIds: IDS, action: "reject" }),
        }),
      );
    });
  });

  it("includes skipped count in success toast on partial success", async () => {
    mockFetch(200, { data: { processed: 1, skipped: 1, results: [] } });
    const user = userEvent.setup();

    renderWithPortalProviders(
      <BulkActionToolbar
        selectedCount={2}
        applicationIds={IDS}
        onBulkComplete={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("bulk-advance-button"));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/1 advanced.*1 skipped/));
    });
  });

  it("passes accessibility check", async () => {
    const { container } = renderWithPortalProviders(
      <BulkActionToolbar
        selectedCount={3}
        applicationIds={IDS}
        onBulkComplete={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
