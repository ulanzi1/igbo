import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { SeekerPreferencesSection } from "./seeker-preferences-section";

expect.extend(toHaveNoViolations);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, ...props }: { children: React.ReactNode }) => (
    <span data-testid="badge" {...props}>
      {children}
    </span>
  ),
}));

vi.mock("@/components/ui/select", () => ({
  // SelectTrigger holds aria-label; Select renders as <select> with that label
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    value: string;
    onValueChange: (v: string) => void;
  }) => {
    // Extract aria-label from SelectTrigger child props
    let ariaLabel: string | undefined;
    React.Children.forEach(children, (child: unknown) => {
      const el = child as React.ReactElement<Record<string, unknown>> | null;
      if (el?.props?.["aria-label"]) ariaLabel = el.props["aria-label"] as string;
    });
    return (
      <select
        data-testid="currency-select"
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onValueChange(e.target.value)}
      />
    );
  },
  // Don't render trigger/value inside <select> — only <option> elements allowed
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { toast } from "sonner";
import React from "react";

const mockPrefs = {
  id: "pref-uuid",
  seekerProfileId: "profile-uuid",
  desiredRoles: ["Engineer"],
  salaryMin: 200000,
  salaryMax: 500000,
  salaryCurrency: "NGN" as const,
  locations: ["Lagos"],
  workModes: ["remote"] as string[],
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SeekerPreferencesSection", () => {
  it("renders empty state with no initial prefs", () => {
    render(<SeekerPreferencesSection />);
    expect(screen.getByRole("form", { name: /preferencesTitle/i })).toBeTruthy();
    expect(screen.getByPlaceholderText("preferencesDesiredRolesPlaceholder")).toBeTruthy();
  });

  it("renders with initial preferences populated", () => {
    render(<SeekerPreferencesSection initialPrefs={mockPrefs} />);
    const badges = screen.getAllByTestId("badge");
    const texts = badges.map((b) => b.textContent);
    expect(texts.some((t) => t?.includes("Engineer"))).toBe(true);
    expect(texts.some((t) => t?.includes("Lagos"))).toBe(true);
  });

  it("adds a desired role on Enter key", async () => {
    render(<SeekerPreferencesSection />);
    const input = screen.getByPlaceholderText("preferencesDesiredRolesPlaceholder");
    await userEvent.type(input, "Designer");
    fireEvent.keyDown(input, { key: "Enter" });
    const badges = screen.getAllByTestId("badge");
    expect(badges.some((b) => b.textContent?.includes("Designer"))).toBe(true);
  });

  it("removes a desired role when × is clicked", async () => {
    render(<SeekerPreferencesSection initialPrefs={mockPrefs} />);
    const removeBtn = screen.getByLabelText("Remove Engineer");
    await userEvent.click(removeBtn);
    const badges = screen.queryAllByTestId("badge");
    expect(badges.every((b) => !b.textContent?.includes("Engineer"))).toBe(true);
  });

  it("toggles work mode checkbox", async () => {
    render(<SeekerPreferencesSection />);
    const remoteCheckbox = screen.getByRole("checkbox", { name: /remote/i });
    expect(remoteCheckbox).not.toBeChecked();
    await userEvent.click(remoteCheckbox);
    expect(remoteCheckbox).toBeChecked();
  });

  it("submits preferences and shows success toast", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ data: mockPrefs }) });
    render(<SeekerPreferencesSection initialPrefs={mockPrefs} />);
    const submitBtn = screen.getByRole("button", { name: /preferencesSave/i });
    await userEvent.click(submitBtn);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/v1/seekers/me/preferences",
        expect.objectContaining({ method: "PUT" }),
      );
      expect(toast.success).toHaveBeenCalledWith("preferencesSuccess");
    });
  });

  it("shows error toast when submit fails", async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    render(<SeekerPreferencesSection initialPrefs={mockPrefs} />);
    const submitBtn = screen.getByRole("button", { name: /preferencesSave/i });
    await userEvent.click(submitBtn);
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("preferencesError");
    });
  });

  it("shows role cap reached message when at limit", () => {
    const manyRoles = {
      ...mockPrefs,
      desiredRoles: Array.from({ length: 20 }, (_, i) => `Role ${i}`),
    };
    render(<SeekerPreferencesSection initialPrefs={manyRoles} />);
    expect(screen.getByText("preferencesDesiredRolesCapReached")).toBeTruthy();
  });

  it("adds a location on Enter key", async () => {
    render(<SeekerPreferencesSection />);
    const input = screen.getByPlaceholderText("preferencesLocationsPlaceholder");
    await userEvent.type(input, "Abuja");
    fireEvent.keyDown(input, { key: "Enter" });
    const badges = screen.getAllByTestId("badge");
    expect(badges.some((b) => b.textContent?.includes("Abuja"))).toBe(true);
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<SeekerPreferencesSection />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  // P-2.3: onSave callback
  it("calls onSave after successful save", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ data: mockPrefs }) });
    const onSave = vi.fn();
    render(<SeekerPreferencesSection initialPrefs={mockPrefs} onSave={onSave} />);
    const submitBtn = screen.getByRole("button", { name: /preferencesSave/i });
    await userEvent.click(submitBtn);
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
  });
});
