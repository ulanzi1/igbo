// @vitest-environment jsdom
import { render, screen } from "@/test/test-utils";
import { Card } from "./card";

describe("Card variants", () => {
  it("renders standard variant by default with correct data-variant attribute", () => {
    render(<Card data-testid="card">content</Card>);
    const card = screen.getByTestId("card");
    expect(card).toHaveAttribute("data-variant", "standard");
  });

  it("renders standard variant with subtle shadow class", () => {
    render(
      <Card variant="standard" data-testid="card">
        content
      </Card>,
    );
    const card = screen.getByTestId("card");
    expect(card.className).toContain("shadow-[0_1px_3px_rgba(0,0,0,0.08)]");
    expect(card).toHaveAttribute("data-variant", "standard");
  });

  it("renders elevated variant with stronger shadow class", () => {
    render(
      <Card variant="elevated" data-testid="card">
        content
      </Card>,
    );
    const card = screen.getByTestId("card");
    expect(card.className).toContain("shadow-[0_4px_12px_rgba(0,0,0,0.12)]");
    expect(card).toHaveAttribute("data-variant", "elevated");
  });

  it("renders flat variant with no shadow", () => {
    render(
      <Card variant="flat" data-testid="card">
        content
      </Card>,
    );
    const card = screen.getByTestId("card");
    expect(card.className).toContain("shadow-none");
    expect(card).toHaveAttribute("data-variant", "flat");
  });

  it("renders interactive variant with hover and transition classes", () => {
    render(
      <Card variant="interactive" data-testid="card">
        content
      </Card>,
    );
    const card = screen.getByTestId("card");
    expect(card.className).toContain("cursor-pointer");
    expect(card.className).toContain("transition-all");
    expect(card).toHaveAttribute("data-variant", "interactive");
  });

  it("applies 12px rounded-lg border-radius to all variants", () => {
    const variants = ["standard", "elevated", "flat", "interactive"] as const;
    variants.forEach((variant) => {
      const { unmount } = render(
        <Card variant={variant} data-testid={`card-${variant}`}>
          content
        </Card>,
      );
      const card = screen.getByTestId(`card-${variant}`);
      expect(card.className).toContain("rounded-lg");
      unmount();
    });
  });
});
