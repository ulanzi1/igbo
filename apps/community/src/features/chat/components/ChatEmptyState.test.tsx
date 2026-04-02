import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
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
  }) => React.createElement("a", { href, ...props }, children),
}));

vi.mock("@/lib/utils", () => ({ cn: (...args: string[]) => args.filter(Boolean).join(" ") }));

import { ChatEmptyState } from "./ChatEmptyState";

describe("ChatEmptyState", () => {
  it("renders speech bubbles icon", () => {
    const { container } = render(<ChatEmptyState />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders start a conversation heading (via t('title'))", () => {
    render(<ChatEmptyState />);
    expect(screen.getByText("title")).toBeInTheDocument();
  });

  it("renders subtitle text", () => {
    render(<ChatEmptyState />);
    expect(screen.getByText("subtitle")).toBeInTheDocument();
  });

  it("renders Find Members CTA button linking to discover", () => {
    render(<ChatEmptyState />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/discover");
    expect(link).toHaveTextContent("cta");
  });
});
