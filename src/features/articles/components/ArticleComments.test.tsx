// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ArticleComments } from "./ArticleComments";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockUseSession = vi.fn();

vi.mock("next-auth/react", () => ({
  useSession: (...args: unknown[]) => mockUseSession(...args),
}));

vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string) => `${ns}.${key}`,
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ARTICLE_ID = "article-uuid-1";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderComments(props?: { articleId?: string; membersOnly?: boolean }) {
  const client = makeQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <ArticleComments
        articleId={props?.articleId ?? ARTICLE_ID}
        membersOnly={props?.membersOnly ?? false}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockUseSession.mockReset();
  mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ data: { items: [], total: 0 } }),
  });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ArticleComments — guest user", () => {
  it("renders guest CTA when user is not logged in and article is not members-only", async () => {
    renderComments({ membersOnly: false });

    await waitFor(() => {
      expect(screen.getByText("Articles.comments.guestCta")).toBeInTheDocument();
    });
  });

  it("renders members-only CTA when user is guest and article is members-only", async () => {
    renderComments({ membersOnly: true });

    await waitFor(() => {
      expect(screen.getByText("Articles.comments.membersOnlyCta")).toBeInTheDocument();
    });
  });

  it("does NOT show guest CTA while session is still loading", async () => {
    mockUseSession.mockReturnValue({ data: null, status: "loading" });
    renderComments({ membersOnly: false });

    // During loading, isGuest = false — no guest CTA should flash
    expect(screen.queryByText("Articles.comments.guestCta")).not.toBeInTheDocument();
  });
});

describe("ArticleComments — authenticated user", () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({
      data: { user: { id: "user-1", name: "Test User" } },
      status: "authenticated",
    });
  });

  it("renders comment form for authenticated users", async () => {
    renderComments();

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Articles.comments.placeholder")).toBeInTheDocument();
    });
  });

  it("renders empty state when no comments exist", async () => {
    renderComments();

    await waitFor(() => {
      expect(screen.getByText("Articles.comments.empty")).toBeInTheDocument();
    });
  });

  it("renders comments when they exist", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            items: [
              {
                id: "c1",
                articleId: ARTICLE_ID,
                authorId: "user-1",
                authorName: "Alice",
                authorPhotoUrl: null,
                content: "Great article!",
                parentCommentId: null,
                createdAt: new Date().toISOString(),
              },
            ],
            total: 1,
          },
        }),
    });

    renderComments();

    await waitFor(() => {
      expect(screen.getByText("Great article!")).toBeInTheDocument();
    });
  });

  it("shows error message when comment submission fails", async () => {
    const user = userEvent.setup();

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { items: [], total: 0 } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: "Failed" }),
      });

    renderComments();

    const textarea = await screen.findByPlaceholderText("Articles.comments.placeholder");
    await user.type(textarea, "My failing comment");

    const submitButton = screen.getByRole("button", { name: "Articles.comments.submit" });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("Articles.comments.error")).toBeInTheDocument();
    });
  });

  it("submits a comment successfully and resets form", async () => {
    const user = userEvent.setup();

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { items: [], total: 0 } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { commentId: "new-comment-id" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { items: [], total: 0 } }),
      });

    renderComments();

    const textarea = await screen.findByPlaceholderText("Articles.comments.placeholder");
    await user.type(textarea, "My new comment");

    const submitButton = screen.getByRole("button", { name: "Articles.comments.submit" });
    await user.click(submitButton);

    // After submit, textarea should be cleared
    await waitFor(() => {
      expect((textarea as HTMLTextAreaElement).value).toBe("");
    });
  });
});
