import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { SalaryRangeInput } from "./salary-range-input";

expect.extend(toHaveNoViolations);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SalaryRangeInput", () => {
  const defaultProps = {
    min: null,
    max: null,
    competitiveOnly: false,
    onMinChange: vi.fn(),
    onMaxChange: vi.fn(),
    onCompetitiveOnlyChange: vi.fn(),
  };

  it("renders min and max input fields when competitiveOnly is false", () => {
    render(<SalaryRangeInput {...defaultProps} />);
    expect(screen.getByLabelText("min")).toBeTruthy();
    expect(screen.getByLabelText("max")).toBeTruthy();
  });

  it("hides min and max input fields when competitiveOnly is true", () => {
    render(<SalaryRangeInput {...defaultProps} competitiveOnly />);
    expect(screen.queryByLabelText("min")).toBeNull();
    expect(screen.queryByLabelText("max")).toBeNull();
  });

  it('shows "Competitive" label when competitiveOnly is true', () => {
    render(<SalaryRangeInput {...defaultProps} competitiveOnly />);
    expect(screen.getByText("competitive")).toBeTruthy();
  });

  it("calls onCompetitiveOnlyChange when toggle is clicked", () => {
    const onCompetitiveOnlyChange = vi.fn();
    render(
      <SalaryRangeInput {...defaultProps} onCompetitiveOnlyChange={onCompetitiveOnlyChange} />,
    );
    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    expect(onCompetitiveOnlyChange).toHaveBeenCalledWith(true);
  });

  it("preserves min/max values in parent state when toggle checked then unchecked", () => {
    const onCompetitiveOnlyChange = vi.fn();
    const { rerender } = render(
      <SalaryRangeInput
        {...defaultProps}
        min={500000}
        max={750000}
        onCompetitiveOnlyChange={onCompetitiveOnlyChange}
      />,
    );
    // Check the competitive-only toggle
    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    expect(onCompetitiveOnlyChange).toHaveBeenCalledWith(true);

    // Rerender with competitiveOnly=true (parent updated state) — values still present in props
    rerender(
      <SalaryRangeInput
        {...defaultProps}
        min={500000}
        max={750000}
        competitiveOnly
        onCompetitiveOnlyChange={onCompetitiveOnlyChange}
      />,
    );
    // Fields hidden — but if we uncheck, fields reappear with the same values
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onCompetitiveOnlyChange).toHaveBeenCalledWith(false);

    // Rerender with competitiveOnly=false and values restored
    rerender(
      <SalaryRangeInput
        {...defaultProps}
        min={500000}
        max={750000}
        competitiveOnly={false}
        onCompetitiveOnlyChange={onCompetitiveOnlyChange}
      />,
    );
    const minInput = screen.getByLabelText("min") as HTMLInputElement;
    expect(minInput.value).toBe("500000");
  });

  it("calls onMinChange with numeric value when min field changes", () => {
    const onMinChange = vi.fn();
    render(<SalaryRangeInput {...defaultProps} onMinChange={onMinChange} />);
    const minInput = screen.getByLabelText("min");
    fireEvent.change(minInput, { target: { value: "300000" } });
    expect(onMinChange).toHaveBeenCalledWith(300000);
  });

  it("calls onMaxChange with numeric value when max field changes", () => {
    const onMaxChange = vi.fn();
    render(<SalaryRangeInput {...defaultProps} onMaxChange={onMaxChange} />);
    const maxInput = screen.getByLabelText("max");
    fireEvent.change(maxInput, { target: { value: "700000" } });
    expect(onMaxChange).toHaveBeenCalledWith(700000);
  });

  it("calls onMinChange with null when min field is cleared", () => {
    const onMinChange = vi.fn();
    render(<SalaryRangeInput {...defaultProps} min={300000} onMinChange={onMinChange} />);
    const minInput = screen.getByLabelText("min");
    fireEvent.change(minInput, { target: { value: "" } });
    expect(onMinChange).toHaveBeenCalledWith(null);
  });

  it("shows inline validation error for min field", () => {
    render(
      <SalaryRangeInput
        {...defaultProps}
        errors={{ min: "Minimum salary must be less than maximum" }}
      />,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Minimum salary must be less than maximum")).toBeTruthy();
  });

  it("passes axe-core accessibility assertion", async () => {
    const { container } = render(<SalaryRangeInput {...defaultProps} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
