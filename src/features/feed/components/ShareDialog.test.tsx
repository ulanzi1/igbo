// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { ShareDialog } from "./ShareDialog";

vi.mock("../actions/share-post", () => ({
  repostAction: vi.fn(),
  shareToConversationAction: vi.fn(),
}));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));
vi.mock("react", async () => ({
  ...(await vi.importActual("react")),
  useTransition: () => [
    false,
    (fn: () => void) => {
      void fn();
    },
  ],
}));
vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string, params?: Record<string, unknown>) =>
    params ? `${ns}.${key}(${JSON.stringify(params)})` : `${ns}.${key}`,
}));

import { repostAction } from "../actions/share-post";

const mockRepostAction = vi.mocked(repostAction);

const POST_ID = "550e8400-e29b-41d4-a716-446655440000";

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderDialog(isOpen = true, onClose = vi.fn(), onShareComplete = vi.fn()) {
  const client = makeQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <ShareDialog
        postId={POST_ID}
        postAuthorName="Ada"
        isOpen={isOpen}
        onClose={onClose}
        onShareComplete={onShareComplete}
        sort="chronological"
        filter="all"
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockRepostAction.mockReset();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ data: { conversations: [] } }),
  });
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
  });
});

describe("ShareDialog", () => {
  it("does not render when isOpen=false", () => {
    renderDialog(false);
    expect(screen.queryByTestId("dialog")).not.toBeInTheDocument();
  });

  it("renders dialog with share options when isOpen=true", () => {
    renderDialog(true);
    expect(screen.getByTestId("dialog")).toBeInTheDocument();
  });

  it("shows Repost tab by default", () => {
    renderDialog(true);
    expect(screen.getByPlaceholderText("Feed.share.repostWithComment")).toBeInTheDocument();
  });

  it("calls repostAction with postId and commentText on repost submit", async () => {
    mockRepostAction.mockResolvedValue({ success: true, postId: "new-post" });

    renderDialog(true);
    const textarea = screen.getByPlaceholderText("Feed.share.repostWithComment");
    fireEvent.change(textarea, { target: { value: "My thoughts" } });
    fireEvent.click(screen.getByText("Feed.share.repostSubmit"));

    await waitFor(() => {
      expect(mockRepostAction).toHaveBeenCalledWith(
        expect.objectContaining({ originalPostId: POST_ID, commentText: "My thoughts" }),
      );
    });
  });

  it("calls onShareComplete on successful repost", async () => {
    const onShareComplete = vi.fn();
    mockRepostAction.mockResolvedValue({ success: true, postId: "new-post" });

    renderDialog(true, vi.fn(), onShareComplete);
    fireEvent.click(screen.getByText("Feed.share.repostSubmit"));

    await waitFor(() => {
      expect(onShareComplete).toHaveBeenCalled();
    });
  });

  it("shows error message when repost action fails", async () => {
    mockRepostAction.mockResolvedValue({
      success: false,
      errorCode: "INTERNAL_ERROR",
      reason: "Failed",
    });

    renderDialog(true);
    fireEvent.click(screen.getByText("Feed.share.repostSubmit"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Feed.share.errorGeneric");
    });
  });

  it("copy link button calls navigator.clipboard.writeText with correct URL", async () => {
    Object.defineProperty(window, "location", {
      value: { origin: "https://example.com" },
      writable: true,
    });

    renderDialog(true);
    fireEvent.click(screen.getByText("Feed.share.copyLink"));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        `https://example.com/feed?post=${POST_ID}`,
      );
    });
  });

  it("shows 'Link copied!' after copy", async () => {
    Object.defineProperty(window, "location", {
      value: { origin: "https://example.com" },
      writable: true,
    });

    renderDialog(true);
    fireEvent.click(screen.getByText("Feed.share.copyLink"));

    await waitFor(() => {
      expect(screen.getByText("Feed.share.linkCopied")).toBeInTheDocument();
    });
  });

  it("Group tab button is disabled", () => {
    renderDialog(true);
    const groupBtn = screen.getByRole("button", { name: /Feed.share.shareToGroup/ });
    expect(groupBtn).toBeDisabled();
  });
});
