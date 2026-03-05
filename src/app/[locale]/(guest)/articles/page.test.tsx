// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/test-utils";

vi.mock("next-intl/server", () => ({
  getTranslations: async (ns?: string | { locale: string; namespace: string }) => {
    const namespace = typeof ns === "string" ? ns : ns?.namespace;
    return (key: string) => `${namespace}.${key}`;
  },
  setRequestLocale: vi.fn(),
}));

vi.mock("@/db/queries/articles", () => ({
  listPublishedArticlesPublic: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  createArticle: vi.fn(),
  updateArticle: vi.fn(),
  submitArticleForReview: vi.fn(),
  countWeeklyArticleSubmissions: vi.fn(),
  upsertArticleTags: vi.fn(),
  getArticleForEditing: vi.fn(),
  listPendingArticles: vi.fn(),
  getArticleByIdForAdmin: vi.fn(),
  publishArticleById: vi.fn(),
  rejectArticleById: vi.fn(),
  toggleArticleFeature: vi.fn(),
  listPublishedArticles: vi.fn(),
  getPublishedArticleBySlug: vi.fn(),
  incrementArticleViewCount: vi.fn(),
  getRelatedArticles: vi.fn(),
  getArticleTagsById: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/articles",
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  redirect: vi.fn(),
  getPathname: vi.fn(),
}));

import ArticlesPage from "./page";

describe("ArticlesPage", () => {
  it("renders empty state with CTA when no data", async () => {
    const Page = await ArticlesPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page);
    expect(screen.getByText("Articles.emptyTitle")).toBeInTheDocument();
    expect(screen.getByText("Articles.emptyDescription")).toBeInTheDocument();
    expect(screen.getByText("Articles.ctaButton")).toBeInTheDocument();
  });

  it("has a single h1", async () => {
    const Page = await ArticlesPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});
