import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
}));

import { TrustBadge } from "./trust-badge";

describe("TrustBadge", () => {
  it("renders the trust badge", () => {
    render(<TrustBadge />);
    expect(screen.getByTestId("trust-badge")).toBeTruthy();
  });

  it("has correct aria-label", () => {
    render(<TrustBadge />);
    expect(screen.getByTestId("trust-badge").getAttribute("aria-label")).toBe("badge");
  });

  it("shows badge text", () => {
    render(<TrustBadge />);
    expect(screen.getByTestId("trust-badge").textContent).toContain("badge");
  });

  it("shows tooltip content", () => {
    render(<TrustBadge />);
    expect(screen.getByTestId("tooltip-content").textContent).toContain("badgeTooltip");
  });

  it("has no axe accessibility violations", async () => {
    const { container } = render(<TrustBadge />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
