import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { SeekerConsentSection } from "./seeker-consent-section";

expect.extend(toHaveNoViolations);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Radix Switch needs jsdom polyfills
Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  setPointerCapture: () => undefined,
  releasePointerCapture: () => undefined,
  scrollIntoView: () => undefined,
});
// Radix Switch uses ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { toast } from "sonner";
import React from "react";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SeekerConsentSection", () => {
  it("renders both consent toggles", () => {
    render(<SeekerConsentSection />);
    expect(screen.getByLabelText("consentMatchingLabel")).toBeTruthy();
    expect(screen.getByLabelText("consentEmployerViewLabel")).toBeTruthy();
  });

  it("defaults to both consents off", () => {
    render(<SeekerConsentSection />);
    const matchingSwitch = screen.getByRole("switch", { name: /consentMatchingLabel/i });
    expect(matchingSwitch).toHaveAttribute("data-state", "unchecked");
  });

  it("reflects initial consent values", () => {
    render(
      <SeekerConsentSection initialConsentMatching={true} initialConsentEmployerView={false} />,
    );
    const matchingSwitch = screen.getByRole("switch", { name: /consentMatchingLabel/i });
    expect(matchingSwitch).toHaveAttribute("data-state", "checked");
  });

  it("toggles matching consent when switch is clicked", async () => {
    render(<SeekerConsentSection />);
    const matchingSwitch = screen.getByRole("switch", { name: /consentMatchingLabel/i });
    expect(matchingSwitch).toHaveAttribute("data-state", "unchecked");
    await userEvent.click(matchingSwitch);
    expect(matchingSwitch).toHaveAttribute("data-state", "checked");
  });

  it("submits both consent values and shows success toast", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ data: {} }) });
    render(
      <SeekerConsentSection initialConsentMatching={true} initialConsentEmployerView={true} />,
    );
    const submitBtn = screen.getByRole("button", { name: /consentSave/i });
    await userEvent.click(submitBtn);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/v1/seekers/me/consent",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ consentMatching: true, consentEmployerView: true }),
        }),
      );
      expect(toast.success).toHaveBeenCalledWith("consentSuccess");
    });
  });

  it("shows error toast when submit fails", async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    render(<SeekerConsentSection />);
    const submitBtn = screen.getByRole("button", { name: /consentSave/i });
    await userEvent.click(submitBtn);
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("consentError");
    });
  });

  it("shows the compliance note", () => {
    render(<SeekerConsentSection />);
    expect(screen.getByText("consentNote")).toBeTruthy();
  });

  it("shows last-changed pill when matchingChangedAt is present", () => {
    render(
      <SeekerConsentSection
        initialConsentMatching={true}
        matchingChangedAt="2026-04-01T12:00:00Z"
      />,
    );
    expect(screen.getByTestId("matching-changed-at")).toBeTruthy();
  });

  it("does not show last-changed pill when timestamps are null", () => {
    render(<SeekerConsentSection />);
    expect(screen.queryByTestId("matching-changed-at")).toBeNull();
    expect(screen.queryByTestId("employer-view-changed-at")).toBeNull();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<SeekerConsentSection />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
