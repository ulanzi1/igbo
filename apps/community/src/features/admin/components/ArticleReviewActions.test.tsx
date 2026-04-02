// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
    open ? <div data-testid="alert-dialog">{children}</div> : null,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
  AlertDialogAction: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

import { ArticleReviewActions } from "./ArticleReviewActions";
import { toast } from "sonner";

const ARTICLE_ID = "00000000-0000-4000-8000-000000000001";

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderActions(props: { mode: "pending" | "published"; isFeatured?: boolean }) {
  const client = makeClient();
  return render(
    <QueryClientProvider client={client}>
      <ArticleReviewActions articleId={ARTICLE_ID} {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  global.fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ data: { articleId: ARTICLE_ID } }), { status: 200 }),
    );
});

describe("ArticleReviewActions", () => {
  describe("pending mode", () => {
    it("renders approve and reject buttons", () => {
      renderActions({ mode: "pending" });
      expect(screen.getByText("articles.approve")).toBeInTheDocument();
      expect(screen.getByText("articles.reject")).toBeInTheDocument();
    });

    it("calls POST publish route on approve click", async () => {
      renderActions({ mode: "pending" });

      fireEvent.click(screen.getByText("articles.approve"));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/v1/admin/articles/${ARTICLE_ID}/publish`,
          expect.objectContaining({ method: "POST", credentials: "include" }),
        );
      });

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith("articles.approveSuccess");
      });
    });

    it("shows error toast on approve failure", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        new Response("", { status: 500 }),
      );

      renderActions({ mode: "pending" });
      fireEvent.click(screen.getByText("articles.approve"));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("articles.approveError");
      });
    });

    it("opens reject dialog and calls POST reject route with feedback", async () => {
      renderActions({ mode: "pending" });

      // Click reject to open dialog
      fireEvent.click(screen.getByText("articles.reject"));

      await waitFor(() => {
        expect(screen.getByTestId("alert-dialog")).toBeInTheDocument();
      });

      // Enter feedback
      const textarea = screen.getByPlaceholderText("articles.feedbackPlaceholder");
      fireEvent.change(textarea, { target: { value: "Needs more detail" } });

      // Click the reject confirmation button (second "articles.reject" text in the dialog)
      const rejectButtons = screen.getAllByText("articles.reject");
      const dialogRejectBtn = rejectButtons[rejectButtons.length - 1];
      fireEvent.click(dialogRejectBtn);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/v1/admin/articles/${ARTICLE_ID}/reject`,
          expect.objectContaining({
            method: "POST",
            credentials: "include",
            body: JSON.stringify({ feedback: "Needs more detail" }),
          }),
        );
      });

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith("articles.rejectSuccess");
      });
    });

    it("reject confirm button is disabled when feedback is empty", async () => {
      renderActions({ mode: "pending" });

      fireEvent.click(screen.getByText("articles.reject"));

      await waitFor(() => {
        expect(screen.getByTestId("alert-dialog")).toBeInTheDocument();
      });

      // The confirm reject button should be disabled when no feedback entered
      const rejectButtons = screen.getAllByText("articles.reject");
      const dialogRejectBtn = rejectButtons[rejectButtons.length - 1] as HTMLButtonElement;
      expect(dialogRejectBtn.disabled).toBe(true);
    });

    it("renders request revision button in pending mode", () => {
      renderActions({ mode: "pending" });
      expect(screen.getByText("articles.requestRevision")).toBeInTheDocument();
    });

    it("opens revision dialog and calls POST request-revision route with feedback", async () => {
      renderActions({ mode: "pending" });

      fireEvent.click(screen.getByText("articles.requestRevision"));

      await waitFor(() => {
        expect(screen.getByTestId("alert-dialog")).toBeInTheDocument();
      });

      const textarea = screen.getByPlaceholderText("articles.revisionFeedbackPlaceholder");
      fireEvent.change(textarea, { target: { value: "Please add more context" } });

      fireEvent.click(screen.getByText("articles.revisionSubmit"));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/v1/admin/articles/${ARTICLE_ID}/request-revision`,
          expect.objectContaining({
            method: "POST",
            credentials: "include",
            body: JSON.stringify({ feedback: "Please add more context" }),
          }),
        );
      });

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith("articles.revisionSuccess");
      });
    });

    it("revision submit button is disabled when feedback is empty", async () => {
      renderActions({ mode: "pending" });

      fireEvent.click(screen.getByText("articles.requestRevision"));

      await waitFor(() => {
        expect(screen.getByTestId("alert-dialog")).toBeInTheDocument();
      });

      const submitBtn = screen.getByText("articles.revisionSubmit") as HTMLButtonElement;
      expect(submitBtn.disabled).toBe(true);
    });

    it("shows error toast on revision request failure", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        new Response("", { status: 500 }),
      );

      renderActions({ mode: "pending" });
      fireEvent.click(screen.getByText("articles.requestRevision"));

      await waitFor(() => {
        expect(screen.getByTestId("alert-dialog")).toBeInTheDocument();
      });

      const textarea = screen.getByPlaceholderText("articles.revisionFeedbackPlaceholder");
      fireEvent.change(textarea, { target: { value: "Needs work" } });
      fireEvent.click(screen.getByText("articles.revisionSubmit"));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("articles.revisionError");
      });
    });
  });

  describe("published mode", () => {
    it("renders feature toggle switch", () => {
      renderActions({ mode: "published", isFeatured: false });
      expect(screen.getByRole("switch")).toBeInTheDocument();
      expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
    });

    it("calls PATCH feature route to feature an article", async () => {
      renderActions({ mode: "published", isFeatured: false });

      fireEvent.click(screen.getByRole("switch"));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/v1/admin/articles/${ARTICLE_ID}/feature`,
          expect.objectContaining({
            method: "PATCH",
            credentials: "include",
            body: JSON.stringify({ featured: true }),
          }),
        );
      });
    });

    it("calls PATCH feature route to unfeature an article", async () => {
      renderActions({ mode: "published", isFeatured: true });

      expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
      fireEvent.click(screen.getByRole("switch"));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/v1/admin/articles/${ARTICLE_ID}/feature`,
          expect.objectContaining({
            method: "PATCH",
            body: JSON.stringify({ featured: false }),
          }),
        );
      });
    });

    it("shows error toast on feature toggle failure", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        new Response("", { status: 500 }),
      );

      renderActions({ mode: "published", isFeatured: false });
      fireEvent.click(screen.getByRole("switch"));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("articles.featureError");
      });
    });
  });
});
