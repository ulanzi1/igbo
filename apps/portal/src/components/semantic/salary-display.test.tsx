import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SalaryDisplay } from "./salary-display";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}));

describe("SalaryDisplay", () => {
  it('shows "competitive" label when competitiveOnly is true', () => {
    render(<SalaryDisplay competitiveOnly min={500000} max={750000} />);
    expect(screen.getByText("competitive")).toBeTruthy();
  });

  it("shows range format when both min and max are provided", () => {
    render(<SalaryDisplay competitiveOnly={false} min={500000} max={750000} />);
    // The mock returns "rangeFormat:{min:..., max:...}"
    const text = screen.getByText(/rangeFormat/);
    expect(text).toBeTruthy();
  });

  it('shows "from" format when only min is provided', () => {
    render(<SalaryDisplay competitiveOnly={false} min={500000} />);
    const text = screen.getByText(/from/i);
    expect(text).toBeTruthy();
  });

  it('shows "upTo" format when only max is provided', () => {
    render(<SalaryDisplay competitiveOnly={false} max={750000} />);
    const text = screen.getByText(/upTo/i);
    expect(text).toBeTruthy();
  });

  it("renders nothing when no salary info is provided", () => {
    const { container } = render(<SalaryDisplay competitiveOnly={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when min and max are null", () => {
    const { container } = render(<SalaryDisplay competitiveOnly={false} min={null} max={null} />);
    expect(container.firstChild).toBeNull();
  });
});
