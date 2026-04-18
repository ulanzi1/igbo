// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";
import igMessages from "../../../messages/ig.json";

expect.extend(toHaveNoViolations);

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/en/jobs",
}));

beforeAll(() => {
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
});

import { CategoryCard } from "./category-card";

function renderCard(industry: string, count: number, locale = "en") {
  const messages = locale === "ig" ? igMessages : enMessages;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <CategoryCard industry={industry} count={count} />
    </NextIntlClientProvider>,
  );
}

describe("CategoryCard", () => {
  it("renders the translated industry label for known industries", () => {
    renderCard("technology", 42);
    expect(screen.getByText("Technology")).toBeInTheDocument();
  });

  it("renders the raw industry value for unknown industries", () => {
    renderCard("quantum_computing", 3);
    expect(screen.getByText("quantum_computing")).toBeInTheDocument();
  });

  it("renders the job count", () => {
    renderCard("finance", 18);
    expect(screen.getByText(/18/)).toBeInTheDocument();
  });

  it("links to /search?industry={key}", () => {
    renderCard("healthcare", 5);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/en/search?industry=healthcare");
  });

  it("has aria-label combining industry label and count", () => {
    renderCard("technology", 10);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("aria-label", expect.stringContaining("Technology"));
    expect(link).toHaveAttribute("aria-label", expect.stringContaining("10"));
  });

  it("URL-encodes industry values with special characters", () => {
    renderCard("non_profit", 7);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toContain("industry=non_profit");
  });

  it("renders with zero count", () => {
    renderCard("media", 0);
    expect(screen.getByText(/0/)).toBeInTheDocument();
  });

  it("passes axe-core assertion", async () => {
    const { container } = renderCard("technology", 42);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  // -------------------------------------------------------------------------
  // HIGH-3 review fix: Igbo locale coverage
  // -------------------------------------------------------------------------

  describe("Igbo locale", () => {
    it("renders the translated industry label in Igbo", () => {
      renderCard("technology", 42, "ig");
      // ig.json: "technology": "Teknọlọjị"
      expect(screen.getByText("Teknọlọjị")).toBeInTheDocument();
    });

    it("links to /ig/search?industry={key} when locale is ig", () => {
      renderCard("healthcare", 5, "ig");
      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", "/ig/search?industry=healthcare");
    });

    it("passes axe-core assertion in Igbo", async () => {
      const { container } = renderCard("technology", 42, "ig");
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
