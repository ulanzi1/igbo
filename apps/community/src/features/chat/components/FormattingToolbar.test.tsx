import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/utils", () => ({ cn: (...args: unknown[]) => args.filter(Boolean).join(" ") }));

vi.mock("lucide-react", () => ({
  BoldIcon: () => null,
  ItalicIcon: () => null,
  StrikethroughIcon: () => null,
  CodeIcon: () => null,
  LinkIcon: () => null,
}));

import { FormattingToolbar } from "./FormattingToolbar";
import type { FormatSyntax } from "./FormattingToolbar";

describe("FormattingToolbar", () => {
  it("renders a toolbar with 5 formatting buttons", () => {
    render(<FormattingToolbar onFormat={vi.fn()} />);
    const toolbar = screen.getByRole("toolbar");
    expect(toolbar).toBeInTheDocument();
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(5);
  });

  it.each([
    ["bold", "bold"],
    ["italic", "italic"],
    ["strikethrough", "strikethrough"],
    ["code", "code"],
    ["link", "link"],
  ] as [string, FormatSyntax][])(
    "calls onFormat('%s') when %s button is clicked",
    (label, syntax) => {
      const onFormat = vi.fn();
      render(<FormattingToolbar onFormat={onFormat} />);
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(onFormat).toHaveBeenCalledWith(syntax);
    },
  );

  it("applies custom className", () => {
    const { container } = render(<FormattingToolbar onFormat={vi.fn()} className="custom-class" />);
    expect(container.firstChild).toHaveClass("custom-class");
  });
});
