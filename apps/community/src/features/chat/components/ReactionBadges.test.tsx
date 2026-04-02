import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}(${JSON.stringify(params)})` : key,
}));

vi.mock("@/lib/utils", () => ({ cn: (...args: unknown[]) => args.filter(Boolean).join(" ") }));

import { ReactionBadges } from "./ReactionBadges";
import type { AggregatedReaction } from "./ReactionBadges";

const reactions: AggregatedReaction[] = [
  { emoji: "👍", count: 3, hasOwnReaction: false },
  { emoji: "❤️", count: 1, hasOwnReaction: true },
];

describe("ReactionBadges", () => {
  it("renders nothing when no reactions", () => {
    const { container } = render(<ReactionBadges reactions={[]} onToggle={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders reaction pills", () => {
    render(<ReactionBadges reactions={reactions} onToggle={vi.fn()} />);
    expect(screen.getByText("👍")).toBeInTheDocument();
    expect(screen.getByText("❤️")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("calls onToggle when a reaction badge is clicked", () => {
    const onToggle = vi.fn();
    render(<ReactionBadges reactions={reactions} onToggle={onToggle} />);
    fireEvent.click(screen.getByText("👍").closest("button")!);
    expect(onToggle).toHaveBeenCalledWith("👍");
  });

  it("sets aria-pressed=true for own reactions", () => {
    render(<ReactionBadges reactions={reactions} onToggle={vi.fn()} />);
    // ❤️ has hasOwnReaction: true
    const heartButton = screen.getByText("❤️").closest("button");
    expect(heartButton).toHaveAttribute("aria-pressed", "true");
    // 👍 has hasOwnReaction: false
    const thumbsButton = screen.getByText("👍").closest("button");
    expect(thumbsButton).toHaveAttribute("aria-pressed", "false");
  });
});
