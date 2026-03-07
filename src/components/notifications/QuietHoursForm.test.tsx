import { describe, it, expect, vi, beforeEach } from "vitest";
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
});
