// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { MyArticlesList } from "./MyArticlesList";

type ArticleStatus = "draft" | "pending_review" | "published" | "revision_requested" | "rejected";

interface FakeArticle {
  id: string;
  title: string;
  slug: string;
  status: ArticleStatus;
  category: string;
  updatedAt: Date;
}

function makeArticle(overrides: Partial<FakeArticle> = {}): FakeArticle {
  return {
    id: "article-uuid-1",
    title: "Test Article",
    slug: "test-article-abc123",
    status: "draft",
    category: "discussion",
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("MyArticlesList", () => {
  it("renders empty state when no articles", () => {
    render(<MyArticlesList articles={[]} />);
    expect(screen.getByText("myArticles.empty")).toBeInTheDocument();
    expect(screen.getByText("myArticles.emptyButton")).toBeInTheDocument();
  });

  it("renders article title", () => {
    const article = makeArticle({ title: "My Draft Article" });
    render(<MyArticlesList articles={[article]} />);
    expect(screen.getByText("My Draft Article")).toBeInTheDocument();
  });

  it("renders edit link for non-published articles", () => {
    const article = makeArticle({ id: "art-1", status: "draft" });
    render(<MyArticlesList articles={[article]} />);
    const editLink = screen.getByText("myArticles.editButton");
    expect(editLink.closest("a")).toHaveAttribute("href", "/articles/art-1/edit");
  });

  it("renders view link for published articles", () => {
    const article = makeArticle({ status: "published", slug: "my-article-slug" });
    render(<MyArticlesList articles={[article]} />);
    const viewLink = screen.getByText("myArticles.viewButton");
    expect(viewLink.closest("a")).toHaveAttribute("href", "/articles/my-article-slug");
  });

  it("groups articles by status and shows multiple sections", () => {
    const articles = [
      makeArticle({ id: "1", status: "published", slug: "pub-1", title: "Published One" }),
      makeArticle({ id: "2", status: "draft", title: "Draft One" }),
      makeArticle({ id: "3", status: "revision_requested", title: "Revision One" }),
    ];
    render(<MyArticlesList articles={articles} />);
    expect(screen.getByText("Published One")).toBeInTheDocument();
    expect(screen.getByText("Draft One")).toBeInTheDocument();
    expect(screen.getByText("Revision One")).toBeInTheDocument();
  });

  it("hides sections with no articles", () => {
    const article = makeArticle({ status: "published", slug: "pub-1", title: "Published One" });
    render(<MyArticlesList articles={[article]} />);
    expect(screen.queryByText("myArticles.sectionDraft")).not.toBeInTheDocument();
    expect(screen.queryByText("myArticles.sectionRevision")).not.toBeInTheDocument();
  });

  it("renders revision_requested article with edit link", () => {
    const article = makeArticle({ id: "rev-1", status: "revision_requested" });
    render(<MyArticlesList articles={[article]} />);
    const editLink = screen.getByText("myArticles.editButton");
    expect(editLink.closest("a")).toHaveAttribute("href", "/articles/rev-1/edit");
  });
});
