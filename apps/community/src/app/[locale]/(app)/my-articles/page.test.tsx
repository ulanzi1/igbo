// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const mockAuth = vi.fn();
const mockListArticlesByAuthor = vi.fn();

// Next.js redirect() throws a special error to stop rendering — simulate that
class RedirectError extends Error {
  constructor(public destination: string) {
    super("NEXT_REDIRECT");
  }
}

vi.mock("next/navigation", () => ({
  redirect: (destination: string) => {
    throw new RedirectError(destination);
  },
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async (ns?: string | { namespace: string }) => {
    const namespace = typeof ns === "string" ? ns : ns?.namespace;
    return (key: string) => `${namespace}.${key}`;
  },
}));

vi.mock("@/server/auth/config", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

vi.mock("@igbo/db/queries/articles", () => ({
  listArticlesByAuthor: (...args: unknown[]) => mockListArticlesByAuthor(...args),
}));

vi.mock("@/features/articles/components/MyArticlesList", () => ({
  MyArticlesList: ({ articles }: { articles: unknown[] }) => (
    <div data-testid="my-articles-list" data-count={articles.length} />
  ),
}));

import MyArticlesPage from "./page";

beforeEach(() => {
  mockAuth.mockReset();
  mockListArticlesByAuthor.mockReset();

  mockAuth.mockResolvedValue({ user: { id: "user-uuid-1" } });
  mockListArticlesByAuthor.mockResolvedValue([]);
});

describe("MyArticlesPage", () => {
  it("renders page title and article list", async () => {
    const Page = await MyArticlesPage();
    render(Page);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("my-articles-list")).toBeInTheDocument();
  });

  it("redirects to / when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const err = await MyArticlesPage().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RedirectError);
    expect((err as RedirectError).destination).toBe("/");
  });

  it("passes articles from DB to MyArticlesList", async () => {
    const articles = [{ id: "a1", title: "My Article", status: "draft" }];
    mockListArticlesByAuthor.mockResolvedValue(articles);

    const Page = await MyArticlesPage();
    render(Page);

    const list = screen.getByTestId("my-articles-list");
    expect(list).toHaveAttribute("data-count", "1");
  });
});
