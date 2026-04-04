import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

const mockUseLocale = vi.fn(() => "en");

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => mockUseLocale(),
}));

import { JobDescriptionDisplay } from "./job-description-display";

const EN_HTML = "<p>English description content</p>";
const IG_HTML = "<p>Nkọwa n'asụsụ Igbo</p>";

describe("JobDescriptionDisplay", () => {
  it("shows English description by default when locale is en", () => {
    mockUseLocale.mockReturnValue("en");
    const { container } = render(
      <JobDescriptionDisplay descriptionHtml={EN_HTML} descriptionIgboHtml={IG_HTML} />,
    );
    expect(container.innerHTML).toContain("English description content");
    expect(container.innerHTML).not.toContain("Nkọwa n'asụsụ Igbo");
  });

  it("defaults to Igbo description when locale is ig and Igbo content exists", () => {
    mockUseLocale.mockReturnValue("ig");
    const { container } = render(
      <JobDescriptionDisplay descriptionHtml={EN_HTML} descriptionIgboHtml={IG_HTML} />,
    );
    expect(container.innerHTML).toContain("Nkọwa n'asụsụ Igbo");
    expect(container.innerHTML).not.toContain("English description content");
  });

  it("shows language toggle when Igbo description exists", () => {
    mockUseLocale.mockReturnValue("en");
    render(<JobDescriptionDisplay descriptionHtml={EN_HTML} descriptionIgboHtml={IG_HTML} />);
    expect(screen.getByRole("tablist")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "english" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "igbo" })).toBeTruthy();
  });

  it("switches to Igbo description when IG tab clicked", () => {
    mockUseLocale.mockReturnValue("en");
    const { container } = render(
      <JobDescriptionDisplay descriptionHtml={EN_HTML} descriptionIgboHtml={IG_HTML} />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "igbo" }));
    expect(container.innerHTML).toContain("Nkọwa n'asụsụ Igbo");
    expect(container.innerHTML).not.toContain("English description content");
  });

  it("switches back to English when EN tab clicked after viewing Igbo", () => {
    mockUseLocale.mockReturnValue("ig");
    const { container } = render(
      <JobDescriptionDisplay descriptionHtml={EN_HTML} descriptionIgboHtml={IG_HTML} />,
    );
    // Starts in Igbo (locale=ig)
    expect(container.innerHTML).toContain("Nkọwa n'asụsụ Igbo");
    // Switch to English
    fireEvent.click(screen.getByRole("tab", { name: "english" }));
    expect(container.innerHTML).toContain("English description content");
  });

  it("no language toggle when descriptionIgboHtml is null", () => {
    mockUseLocale.mockReturnValue("en");
    render(<JobDescriptionDisplay descriptionHtml={EN_HTML} descriptionIgboHtml={null} />);
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("no language toggle when descriptionIgboHtml is undefined", () => {
    mockUseLocale.mockReturnValue("en");
    render(<JobDescriptionDisplay descriptionHtml={EN_HTML} />);
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("renders HTML content inside a prose-classed container", () => {
    mockUseLocale.mockReturnValue("en");
    const { container } = render(<JobDescriptionDisplay descriptionHtml={EN_HTML} />);
    const proseDiv = container.querySelector(".prose");
    expect(proseDiv).toBeTruthy();
    expect(proseDiv?.innerHTML).toContain("English description content");
  });

  it("passes axe-core accessibility assertion with toggle", async () => {
    mockUseLocale.mockReturnValue("en");
    const { container } = render(
      <JobDescriptionDisplay descriptionHtml={EN_HTML} descriptionIgboHtml={IG_HTML} />,
    );
    const results = await axe(container);
    // @ts-expect-error jest-axe matcher not in vitest types
    expect(results).toHaveNoViolations();
  });
});
