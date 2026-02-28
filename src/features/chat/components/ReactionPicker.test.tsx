import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { ReactionPicker } from "./ReactionPicker";

describe("ReactionPicker", () => {
  it("renders as a dialog", () => {
    render(<ReactionPicker onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("renders emoji buttons", () => {
    render(<ReactionPicker onSelect={vi.fn()} onClose={vi.fn()} />);
    // Should have at least 10 emoji buttons
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(10);
  });

  it("calls onSelect with emoji when an emoji is clicked", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<ReactionPicker onSelect={onSelect} onClose={onClose} />);

    // Click the thumbs-up button
    const thumbsUp = screen.getByRole("button", { name: "👍" });
    fireEvent.click(thumbsUp);

    expect(onSelect).toHaveBeenCalledWith("👍");
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose after selection", () => {
    const onClose = vi.fn();
    render(<ReactionPicker onSelect={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "❤️" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on Escape key press", () => {
    const onClose = vi.fn();
    render(<ReactionPicker onSelect={vi.fn()} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
