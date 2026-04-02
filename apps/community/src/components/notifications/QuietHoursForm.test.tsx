import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QuietHoursForm } from "./QuietHoursForm";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({ data: { ok: true } }) });
});

describe("QuietHoursForm", () => {
  it("renders enable toggle", () => {
    render(<QuietHoursForm />);
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
    expect(screen.getByText("enableLabel")).toBeInTheDocument();
  });

  it("time inputs are hidden when quiet hours are disabled", () => {
    render(<QuietHoursForm />);
    expect(screen.queryByLabelText("startLabel")).not.toBeInTheDocument();
  });

  it("shows time inputs when enabled toggle is clicked", async () => {
    render(<QuietHoursForm />);
    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(screen.getByText("startLabel")).toBeInTheDocument();
      expect(screen.getByText("endLabel")).toBeInTheDocument();
      expect(screen.getByText("timezoneLabel")).toBeInTheDocument();
    });
  });

  it("calls PUT endpoint when save button is clicked", async () => {
    render(<QuietHoursForm />);

    // Enable quiet hours
    fireEvent.click(screen.getByRole("checkbox"));

    await waitFor(() => {
      expect(screen.getByText("saveButton")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("saveButton"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/v1/user/notification-preferences/quiet-hours",
        expect.objectContaining({ method: "PUT" }),
      );
    });
  });

  it("calls DELETE endpoint when quiet hours are disabled", async () => {
    render(<QuietHoursForm />);

    // Enable then disable
    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox); // enable

    await waitFor(() => {
      expect(screen.getByText("saveButton")).toBeInTheDocument();
    });

    fireEvent.click(checkbox); // disable

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/v1/user/notification-preferences/quiet-hours",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  // ─── Story 9.5: U2 — Timezone auto-detect ───────────────────────────────────

  describe("U2: timezone auto-detect", () => {
    let intlSpy: ReturnType<typeof vi.spyOn>;

    afterEach(() => {
      intlSpy?.mockRestore();
    });

    it("pre-selects detected timezone when it is in COMMON_TIMEZONES", async () => {
      intlSpy = vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
        resolvedOptions: () => ({ timeZone: "Europe/London" }),
      } as Intl.DateTimeFormat);

      render(<QuietHoursForm />);

      // Enable to show timezone select
      fireEvent.click(screen.getByRole("checkbox"));

      await waitFor(() => {
        const select = screen.getByLabelText("timezoneLabel") as HTMLSelectElement;
        expect(select.value).toBe("Europe/London");
      });
    });

    it("falls back to UTC when detected timezone is not in COMMON_TIMEZONES", async () => {
      intlSpy = vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
        resolvedOptions: () => ({ timeZone: "Antarctica/Troll" }),
      } as Intl.DateTimeFormat);

      render(<QuietHoursForm />);
      fireEvent.click(screen.getByRole("checkbox"));

      await waitFor(() => {
        const select = screen.getByLabelText("timezoneLabel") as HTMLSelectElement;
        expect(select.value).toBe("UTC");
      });
    });
  });

  // ─── Story 9.5: U3 — Quiet hours post-save summary ───────────────────────────

  describe("U3: post-save summary state", () => {
    it("shows summary ('savedSummary') after successful save", async () => {
      render(<QuietHoursForm />);

      // Enable and save
      fireEvent.click(screen.getByRole("checkbox"));
      await waitFor(() => {
        expect(screen.getByText("saveButton")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("saveButton"));

      await waitFor(() => {
        // savedSummary key appears in the summary span (t() mock returns key)
        // Use regex to match partial text since span includes time values too
        expect(screen.getByText(/savedSummary/)).toBeInTheDocument();
      });

      // Form inputs should be hidden in summary state
      expect(screen.queryByText("saveButton")).not.toBeInTheDocument();
    });

    it("returns to edit mode when 'editButton' is clicked", async () => {
      render(<QuietHoursForm />);

      // Enable and save
      fireEvent.click(screen.getByRole("checkbox"));
      await waitFor(() => screen.getByText("saveButton"));
      fireEvent.click(screen.getByText("saveButton"));

      // Wait for summary to appear
      await waitFor(() => screen.getByText(/savedSummary/));

      // Click Edit
      fireEvent.click(screen.getByText("editButton"));

      // Form should be visible again
      await waitFor(() => {
        expect(screen.getByText("saveButton")).toBeInTheDocument();
        expect(screen.queryByText(/savedSummary/)).not.toBeInTheDocument();
      });
    });
  });
});
