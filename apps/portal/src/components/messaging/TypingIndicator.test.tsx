// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    if (key === "typing" && params?.name) return `${params.name} is typing...`;
    if (key === "typingUnknown") return "Typing...";
    return key;
  },
}));

import { TypingIndicator } from "./TypingIndicator";

describe("TypingIndicator", () => {
  it("renders with name — shows '{name} is typing...'", () => {
    const { getByText } = render(<TypingIndicator typingName="Alice" />);
    expect(getByText("Alice is typing...")).toBeDefined();
  });

  it("renders without name — shows 'Typing...'", () => {
    const { getByText } = render(<TypingIndicator />);
    expect(getByText("Typing...")).toBeDefined();
  });

  it("has role='status' for accessibility", () => {
    const { getByRole } = render(<TypingIndicator />);
    expect(getByRole("status")).toBeDefined();
  });

  it("has aria-live='polite' for non-interruptive announcements", () => {
    const { getByRole } = render(<TypingIndicator />);
    expect(getByRole("status").getAttribute("aria-live")).toBe("polite");
  });

  it("has data-testid='typing-indicator'", () => {
    const { getByTestId } = render(<TypingIndicator />);
    expect(getByTestId("typing-indicator")).toBeDefined();
  });
});
