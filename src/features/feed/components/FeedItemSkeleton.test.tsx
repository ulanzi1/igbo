// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FeedItemSkeleton } from "./FeedItemSkeleton";

describe("FeedItemSkeleton", () => {
  it("renders with aria-hidden=true", () => {
    const { container } = render(<FeedItemSkeleton />);
    const root = container.firstElementChild;
    expect(root).not.toBeNull();
    expect(root!.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders the animate-pulse container", () => {
    const { container } = render(<FeedItemSkeleton />);
    const root = container.firstElementChild;
    expect(root!.className).toContain("animate-pulse");
  });
});
