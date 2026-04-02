// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("./ArticleReviewActions", () => ({
  ArticleReviewActions: ({ articleId, mode }: { articleId: string; mode: string }) => (
    <div data-testid="article-review-actions" data-id={articleId} data-mode={mode} />
  ),
}));

vi.mock("./ArticlePreviewModal", () => ({
  ArticlePreviewModal: ({ articleId, onClose }: { articleId: string; onClose: () => void }) => (
    <div data-testid="article-preview-modal" data-id={articleId}>
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children, defaultValue }: { children: React.ReactNode; defaultValue?: string }) => (
    <div data-testid="tabs" data-default={defaultValue}>
      {children}
    </div>
  ),
  TabsList: ({ children }: { children: React.ReactNode }) => <div role="tablist">{children}</div>,
  TabsTrigger: ({
    value,
    children,
    onClick,
  }: {
    value: string;
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button role="tab" data-value={value} onClick={onClick}>
      {children}
    </button>
  ),
  TabsContent: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <div data-testid={`tab-content-${value}`}>{children}</div>
  ),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span className={className}>{children}</span>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...rest
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    [key: string]: unknown;
  }) => (
    <button onClick={onClick} disabled={disabled} data-variant={rest["variant"] as string}>
      {children}
    </button>
  ),
}));

import { ArticleReviewQueue } from "./ArticleReviewQueue";

const ARTICLE_ID = "00000000-0000-4000-8000-000000000001";
const PUBLISHED_ID = "00000000-0000-4000-8000-000000000002";

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function makePendingResponse() {
  return {
    data: {
      items: [
        {
          id: ARTICLE_ID,
          title: "Igbo Culture Article",
          authorId: "author-1",
          authorName: "Chidi Okeke",
          language: "en",
          category: "discussion",
          createdAt: "2026-03-01T00:00:00.000Z",
          slug: "igbo-culture-article-abc",
          isFeatured: false,
          status: "pending_review",
        },
      ],
      total: 1,
    },
  };
}

function makePublishedResponse() {
  return {
    data: {
      items: [
        {
          id: PUBLISHED_ID,
          title: "Published Article",
          authorId: "author-2",
          authorName: "Amaka Obi",
          language: "both",
          category: "announcement",
          createdAt: "2026-03-02T00:00:00.000Z",
          slug: "published-article-xyz",
          isFeatured: true,
          status: "published",
        },
      ],
      total: 1,
    },
  };
}

function renderQueue(fetchMock: (url: string) => Promise<Response>) {
  const client = makeClient();
  global.fetch = vi.fn().mockImplementation((url: string) => fetchMock(url));
  return render(
    <QueryClientProvider client={client}>
      <ArticleReviewQueue />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("ArticleReviewQueue", () => {
  it("renders pending tab content with article rows", async () => {
    renderQueue(async (url) => {
      if (url.includes("status=pending_review") || !url.includes("status=")) {
        return new Response(JSON.stringify(makePendingResponse()), { status: 200 });
      }
      return new Response(JSON.stringify({ data: { items: [], total: 0 } }), { status: 200 });
    });

    await waitFor(() => {
      expect(screen.getByText("Igbo Culture Article")).toBeInTheDocument();
    });

    expect(screen.getByText("Chidi Okeke")).toBeInTheDocument();
    expect(screen.getByText("EN")).toBeInTheDocument();
  });

  it("shows empty state when no pending articles", async () => {
    renderQueue(
      async () => new Response(JSON.stringify({ data: { items: [], total: 0 } }), { status: 200 }),
    );

    await waitFor(() => {
      expect(screen.getByText("articles.emptyPending")).toBeInTheDocument();
    });
  });

  it("shows ArticleReviewActions in pending mode for pending articles", async () => {
    renderQueue(async (url) => {
      if (url.includes("status=pending_review") || !url.includes("status=")) {
        return new Response(JSON.stringify(makePendingResponse()), { status: 200 });
      }
      return new Response(JSON.stringify({ data: { items: [], total: 0 } }), { status: 200 });
    });

    await waitFor(() => {
      expect(screen.getByText("Igbo Culture Article")).toBeInTheDocument();
    });

    const actions = screen.getByTestId("article-review-actions");
    expect(actions).toHaveAttribute("data-id", ARTICLE_ID);
    expect(actions).toHaveAttribute("data-mode", "pending");
  });

  it("shows preview modal when Preview is clicked", async () => {
    renderQueue(async (url) => {
      if (url.includes("status=pending_review") || !url.includes("status=")) {
        return new Response(JSON.stringify(makePendingResponse()), { status: 200 });
      }
      return new Response(JSON.stringify({ data: { items: [], total: 0 } }), { status: 200 });
    });

    await waitFor(() => {
      expect(screen.getByText("Igbo Culture Article")).toBeInTheDocument();
    });

    const previewButton = screen.getByText("articles.preview");
    fireEvent.click(previewButton);

    expect(screen.getByTestId("article-preview-modal")).toBeInTheDocument();
    expect(screen.getByTestId("article-preview-modal")).toHaveAttribute("data-id", ARTICLE_ID);
  });

  it("renders published tab with published articles and featured toggle", async () => {
    renderQueue(async (url) => {
      if (url.includes("status=published")) {
        return new Response(JSON.stringify(makePublishedResponse()), { status: 200 });
      }
      return new Response(JSON.stringify({ data: { items: [], total: 0 } }), { status: 200 });
    });

    // Both tabs render their content (Tabs mock renders all TabsContent children)
    await waitFor(() => {
      expect(screen.getByText("Published Article")).toBeInTheDocument();
    });

    const actions = screen.getAllByTestId("article-review-actions");
    const publishedAction = actions.find((el) => el.getAttribute("data-mode") === "published");
    expect(publishedAction).toBeInTheDocument();
    expect(publishedAction).toHaveAttribute("data-id", PUBLISHED_ID);
  });
});
