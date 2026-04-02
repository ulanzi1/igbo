// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/test-utils";

vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${ns}.${key}(${JSON.stringify(params)})`;
    return `${ns}.${key}`;
  },
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [k: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { Footer } from "./Footer";

describe("Footer", () => {
  it("renders copyright with current year", () => {
    render(<Footer />);
    const year = new Date().getFullYear();
    expect(screen.getByText(`Shell.copyright({"year":${year}})`)).toBeInTheDocument();
  });

  it("renders navigation links", () => {
    render(<Footer />);

    expect(screen.getByText("Navigation.about")).toHaveAttribute("href", "/about");
    expect(screen.getByText("Navigation.terms")).toHaveAttribute("href", "/terms");
    expect(screen.getByText("Navigation.privacy")).toHaveAttribute("href", "/privacy");
  });

  it("has footer navigation landmark", () => {
    render(<Footer />);
    expect(screen.getByRole("navigation", { name: "Footer navigation" })).toBeInTheDocument();
  });
});
