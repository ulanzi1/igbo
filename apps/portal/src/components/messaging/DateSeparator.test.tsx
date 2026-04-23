// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      today: "Today",
      yesterday: "Yesterday",
    };
    return map[key] ?? key;
  },
}));

import { DateSeparator } from "./DateSeparator";

describe("DateSeparator", () => {
  it("renders 'Today' for today's date", () => {
    const today = new Date();
    const { getByRole } = render(<DateSeparator date={today} />);
    expect(getByRole("separator")).toHaveAttribute("aria-label", "Today");
  });

  it("renders 'Yesterday' for yesterday's date", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const { getByRole } = render(<DateSeparator date={yesterday} />);
    expect(getByRole("separator")).toHaveAttribute("aria-label", "Yesterday");
  });

  it("renders formatted date for older dates", () => {
    const old = new Date("2024-01-15T00:00:00Z");
    const { getByRole } = render(<DateSeparator date={old} />);
    const el = getByRole("separator");
    // Should include "2024" in the label
    expect(el.getAttribute("aria-label")).toContain("2024");
  });

  it("accepts string date", () => {
    const { getByRole } = render(<DateSeparator date={new Date().toISOString()} />);
    expect(getByRole("separator")).toHaveAttribute("aria-label", "Today");
  });
});
