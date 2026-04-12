// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import React from "react";
import { axe, toHaveNoViolations } from "jest-axe";
import userEvent from "@testing-library/user-event";
import { renderWithPortalProviders, screen, waitFor } from "@/test-utils/render";
import { ExportCandidatesButton } from "./export-candidates-button";

expect.extend(toHaveNoViolations);

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

import { toast } from "sonner";

const JOB_ID = "a1111111-1111-4111-a111-111111111111";

function mockFetchSuccess(filename = "Acme-Corp_Senior-Dev_candidates_2026-04-12.csv") {
  const blob = new Blob(["csv content"], { type: "text/csv" });
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    blob: async () => blob,
    headers: {
      get: (key: string) =>
        key === "Content-Disposition" ? `attachment; filename="${filename}"` : null,
    },
  });
}

function mockFetchFailure(status = 500) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    blob: async () => new Blob(),
    headers: { get: () => null },
  });
}

beforeAll(() => {
  // Stub URL object methods for file download in jsdom
  Object.defineProperty(URL, "createObjectURL", {
    writable: true,
    value: vi.fn().mockReturnValue("blob:fake-url"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    writable: true,
    value: vi.fn(),
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchSuccess();
});

describe("ExportCandidatesButton", () => {
  it("renders export button with correct label", () => {
    renderWithPortalProviders(<ExportCandidatesButton jobId={JOB_ID} applicationCount={3} />);
    expect(
      screen.getByRole("button", { name: /export all candidates as csv/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Export Candidates")).toBeInTheDocument();
  });

  it("shows 'Exporting…' text and disables button during download", async () => {
    let resolveBlob!: (b: Blob) => void;
    const blobPromise = new Promise<Blob>((res) => {
      resolveBlob = res;
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: () => blobPromise,
      headers: {
        get: () => 'attachment; filename="export.csv"',
      },
    });

    const user = userEvent.setup();
    renderWithPortalProviders(<ExportCandidatesButton jobId={JOB_ID} applicationCount={3} />);

    const button = screen.getByRole("button");
    await user.click(button);

    expect(screen.getByText("Exporting…")).toBeInTheDocument();
    expect(button).toBeDisabled();

    resolveBlob(new Blob(["csv"], { type: "text/csv" }));
    await waitFor(() => expect(screen.getByText("Export Candidates")).toBeInTheDocument());
  });

  it("calls the correct API endpoint with credentials", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<ExportCandidatesButton jobId={JOB_ID} applicationCount={2} />);
    await user.click(screen.getByRole("button"));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce());
    expect(global.fetch).toHaveBeenCalledWith(`/api/v1/jobs/${JOB_ID}/export`, {
      credentials: "same-origin",
    });
  });

  it("creates and clicks download anchor on successful response", async () => {
    const realAnchor = document.createElement("a");
    const clickSpy = vi.fn();
    realAnchor.click = clickSpy;
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(
      (tag: string, options?: ElementCreationOptions) => {
        if (tag === "a") return realAnchor;
        return originalCreateElement(tag, options);
      },
    );
    const appendSpy = vi.spyOn(document.body, "appendChild");
    const removeSpy = vi.spyOn(document.body, "removeChild");

    const user = userEvent.setup();
    renderWithPortalProviders(<ExportCandidatesButton jobId={JOB_ID} applicationCount={2} />);
    await user.click(screen.getByRole("button"));
    await waitFor(() => expect(clickSpy).toHaveBeenCalledOnce());
    expect(realAnchor.href).toContain("blob:fake-url");
    expect(realAnchor.download).toBe("Acme-Corp_Senior-Dev_candidates_2026-04-12.csv");
    expect(appendSpy).toHaveBeenCalledWith(realAnchor);
    expect(removeSpy).toHaveBeenCalledWith(realAnchor);
    vi.restoreAllMocks();
  });

  it("shows success toast after download completes", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<ExportCandidatesButton jobId={JOB_ID} applicationCount={2} />);
    await user.click(screen.getByRole("button"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("CSV exported successfully"));
  });

  it("shows error toast on API failure", async () => {
    mockFetchFailure(500);
    const user = userEvent.setup();
    renderWithPortalProviders(<ExportCandidatesButton jobId={JOB_ID} applicationCount={2} />);
    await user.click(screen.getByRole("button"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to export candidates"));
  });

  it("shows warning toast and does not fetch when applicationCount is 0", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<ExportCandidatesButton jobId={JOB_ID} applicationCount={0} />);
    await user.click(screen.getByRole("button"));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledWith("No candidates to export for this posting");
  });

  it("re-enables button after export completes", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<ExportCandidatesButton jobId={JOB_ID} applicationCount={3} />);
    const button = screen.getByRole("button");
    await user.click(button);
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it("passes axe accessibility check in default state", async () => {
    const { container } = renderWithPortalProviders(
      <ExportCandidatesButton jobId={JOB_ID} applicationCount={3} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("passes axe accessibility check in loading state", async () => {
    let resolveBlob!: (b: Blob) => void;
    const blobPromise = new Promise<Blob>((res) => {
      resolveBlob = res;
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: () => blobPromise,
      headers: { get: () => 'attachment; filename="export.csv"' },
    });

    const user = userEvent.setup();
    const { container } = renderWithPortalProviders(
      <ExportCandidatesButton jobId={JOB_ID} applicationCount={3} />,
    );

    await user.click(screen.getByRole("button"));
    // In loading state
    const results = await axe(container);
    expect(results).toHaveNoViolations();

    resolveBlob(new Blob(["csv"], { type: "text/csv" }));
    await waitFor(() => expect(screen.getByText("Export Candidates")).toBeInTheDocument());
  });
});
