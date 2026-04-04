import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { CulturalContextToggles } from "./cultural-context-toggles";

const defaultValue = {
  diasporaFriendly: false,
  igboLanguagePreferred: false,
  communityReferred: false,
};

describe("CulturalContextToggles", () => {
  it("renders all 3 checkboxes with labels", () => {
    render(<CulturalContextToggles value={defaultValue} onChange={vi.fn()} />);
    expect(screen.getByLabelText("diasporaFriendly")).toBeTruthy();
    expect(screen.getByLabelText("igboLanguagePreferred")).toBeTruthy();
    expect(screen.getByLabelText("communityReferred")).toBeTruthy();
  });

  it("shows help text for each toggle", () => {
    render(<CulturalContextToggles value={defaultValue} onChange={vi.fn()} />);
    expect(screen.getByText("diasporaFriendlyHelp")).toBeTruthy();
    expect(screen.getByText("igboLanguagePreferredHelp")).toBeTruthy();
    expect(screen.getByText("communityReferredHelp")).toBeTruthy();
  });

  it("calls onChange with updated value when diasporaFriendly toggled", () => {
    const onChange = vi.fn();
    render(<CulturalContextToggles value={defaultValue} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("diasporaFriendly"));
    expect(onChange).toHaveBeenCalledWith({ ...defaultValue, diasporaFriendly: true });
  });

  it("calls onChange with updated value when igboLanguagePreferred toggled", () => {
    const onChange = vi.fn();
    render(<CulturalContextToggles value={defaultValue} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("igboLanguagePreferred"));
    expect(onChange).toHaveBeenCalledWith({ ...defaultValue, igboLanguagePreferred: true });
  });

  it("calls onChange with updated value when communityReferred toggled", () => {
    const onChange = vi.fn();
    render(<CulturalContextToggles value={defaultValue} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("communityReferred"));
    expect(onChange).toHaveBeenCalledWith({ ...defaultValue, communityReferred: true });
  });

  it("all checkboxes can be independently toggled", () => {
    const onChange = vi.fn();
    render(
      <CulturalContextToggles
        value={{ diasporaFriendly: true, igboLanguagePreferred: false, communityReferred: true }}
        onChange={onChange}
      />,
    );
    const diaspora = screen.getByLabelText("diasporaFriendly") as HTMLInputElement;
    const igbo = screen.getByLabelText("igboLanguagePreferred") as HTMLInputElement;
    const community = screen.getByLabelText("communityReferred") as HTMLInputElement;
    expect(diaspora.checked).toBe(true);
    expect(igbo.checked).toBe(false);
    expect(community.checked).toBe(true);
  });

  it("disabled state -- all checkboxes have disabled attribute set", () => {
    render(<CulturalContextToggles value={defaultValue} onChange={vi.fn()} disabled />);
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checkboxes.length).toBe(3);
    for (const cb of checkboxes) {
      expect(cb.disabled).toBe(true);
    }
  });

  it("aria-describedby links checkbox to help text", () => {
    render(<CulturalContextToggles value={defaultValue} onChange={vi.fn()} />);
    const diasporaCheckbox = screen.getByLabelText("diasporaFriendly");
    expect(diasporaCheckbox.getAttribute("aria-describedby")).toBe("diaspora-friendly-help");
    const igboCheckbox = screen.getByLabelText("igboLanguagePreferred");
    expect(igboCheckbox.getAttribute("aria-describedby")).toBe("igbo-language-preferred-help");
    const communityCheckbox = screen.getByLabelText("communityReferred");
    expect(communityCheckbox.getAttribute("aria-describedby")).toBe("community-referred-help");
  });

  it("passes axe-core accessibility assertion", async () => {
    const { container } = render(
      <CulturalContextToggles value={defaultValue} onChange={vi.fn()} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
