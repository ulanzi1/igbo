import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { LanguageToggle } from "./language-toggle";

describe("LanguageToggle", () => {
  it("renders EN and IG tabs when hasIgbo is true", () => {
    render(<LanguageToggle activeLanguage="en" onLanguageChange={vi.fn()} hasIgbo={true} />);
    expect(screen.getByRole("tab", { name: "english" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "igbo" })).toBeTruthy();
  });

  it("returns null when hasIgbo is false", () => {
    const { container } = render(
      <LanguageToggle activeLanguage="en" onLanguageChange={vi.fn()} hasIgbo={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("EN tab has aria-selected=true when activeLanguage is en", () => {
    render(<LanguageToggle activeLanguage="en" onLanguageChange={vi.fn()} hasIgbo={true} />);
    const enTab = screen.getByRole("tab", { name: "english" });
    expect(enTab.getAttribute("aria-selected")).toBe("true");
    const igTab = screen.getByRole("tab", { name: "igbo" });
    expect(igTab.getAttribute("aria-selected")).toBe("false");
  });

  it("IG tab has aria-selected=true when activeLanguage is ig", () => {
    render(<LanguageToggle activeLanguage="ig" onLanguageChange={vi.fn()} hasIgbo={true} />);
    const igTab = screen.getByRole("tab", { name: "igbo" });
    expect(igTab.getAttribute("aria-selected")).toBe("true");
    const enTab = screen.getByRole("tab", { name: "english" });
    expect(enTab.getAttribute("aria-selected")).toBe("false");
  });

  it("calls onLanguageChange('ig') when Igbo tab clicked", () => {
    const onLanguageChange = vi.fn();
    render(
      <LanguageToggle activeLanguage="en" onLanguageChange={onLanguageChange} hasIgbo={true} />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "igbo" }));
    expect(onLanguageChange).toHaveBeenCalledWith("ig");
  });

  it("calls onLanguageChange('en') when English tab clicked", () => {
    const onLanguageChange = vi.fn();
    render(
      <LanguageToggle activeLanguage="ig" onLanguageChange={onLanguageChange} hasIgbo={true} />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "english" }));
    expect(onLanguageChange).toHaveBeenCalledWith("en");
  });

  it("keyboard Enter on Igbo tab triggers onLanguageChange", () => {
    const onLanguageChange = vi.fn();
    render(
      <LanguageToggle activeLanguage="en" onLanguageChange={onLanguageChange} hasIgbo={true} />,
    );
    const igTab = screen.getByRole("tab", { name: "igbo" });
    fireEvent.keyDown(igTab, { key: "Enter" });
    expect(onLanguageChange).toHaveBeenCalledWith("ig");
  });

  it("keyboard Space on English tab triggers onLanguageChange", () => {
    const onLanguageChange = vi.fn();
    render(
      <LanguageToggle activeLanguage="ig" onLanguageChange={onLanguageChange} hasIgbo={true} />,
    );
    const enTab = screen.getByRole("tab", { name: "english" });
    fireEvent.keyDown(enTab, { key: " " });
    expect(onLanguageChange).toHaveBeenCalledWith("en");
  });

  it("active tab has tabindex=0, inactive has tabindex=-1 (roving tabindex)", () => {
    render(<LanguageToggle activeLanguage="en" onLanguageChange={vi.fn()} hasIgbo={true} />);
    const enTab = screen.getByRole("tab", { name: "english" });
    const igTab = screen.getByRole("tab", { name: "igbo" });
    expect(enTab.getAttribute("tabindex")).toBe("0");
    expect(igTab.getAttribute("tabindex")).toBe("-1");
  });

  it("passes axe-core accessibility assertion", async () => {
    const { container } = render(
      <LanguageToggle activeLanguage="en" onLanguageChange={vi.fn()} hasIgbo={true} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
