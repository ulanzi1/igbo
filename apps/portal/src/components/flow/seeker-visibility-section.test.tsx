import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { SeekerVisibilitySection } from "./seeker-visibility-section";

expect.extend(toHaveNoViolations);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { toast } from "sonner";
import React from "react";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SeekerVisibilitySection", () => {
  it("renders all three visibility options", () => {
    render(<SeekerVisibilitySection />);
    expect(screen.getByRole("radio", { name: /visibilityActive/i })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /visibilityPassive/i })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /visibilityHidden/i })).toBeTruthy();
  });

  it("defaults to passive when no initialVisibility provided", () => {
    render(<SeekerVisibilitySection />);
    expect(screen.getByRole("radio", { name: /visibilityPassive/i })).toBeChecked();
  });

  it("pre-selects active when initialVisibility is active", () => {
    render(<SeekerVisibilitySection initialVisibility="active" />);
    expect(screen.getByRole("radio", { name: /visibilityActive/i })).toBeChecked();
  });

  it("changes selection when radio is clicked", async () => {
    render(<SeekerVisibilitySection />);
    const hiddenRadio = screen.getByRole("radio", { name: /visibilityHidden/i });
    await userEvent.click(hiddenRadio);
    expect(hiddenRadio).toBeChecked();
  });

  it("submits selected visibility and shows success toast", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ data: {} }) });
    render(<SeekerVisibilitySection initialVisibility="passive" />);
    const activeRadio = screen.getByRole("radio", { name: /visibilityActive/i });
    await userEvent.click(activeRadio);
    const submitBtn = screen.getByRole("button", { name: /visibilitySave/i });
    await userEvent.click(submitBtn);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/v1/seekers/me/visibility",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ visibility: "active" }),
        }),
      );
      expect(toast.success).toHaveBeenCalledWith("visibilitySuccess");
    });
  });

  it("shows error toast when submit fails", async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    render(<SeekerVisibilitySection />);
    const submitBtn = screen.getByRole("button", { name: /visibilitySave/i });
    await userEvent.click(submitBtn);
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("visibilityError");
    });
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<SeekerVisibilitySection />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
