import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ChatConversation } from "@/features/chat/types";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ conversationId: undefined }),
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

vi.mock("@/lib/utils", () => ({ cn: (...args: unknown[]) => args.filter(Boolean).join(" ") }));

const mockUseConversations = vi.fn();
vi.mock("@/features/chat/hooks/use-conversations", () => ({
  useConversations: () => mockUseConversations(),
}));

vi.mock("./NewGroupDialog", () => ({
  NewGroupDialog: () => React.createElement("div", { "data-testid": "new-group-dialog" }),
}));

import { ConversationList } from "./ConversationList";

const mockConv: ChatConversation = {
  id: "conv-1",
  type: "direct",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  otherMember: { id: "user-2", displayName: "Ada Okonkwo", photoUrl: null },
  lastMessage: { content: "Hello!", senderId: "user-2", createdAt: new Date().toISOString() },
  unreadCount: 0,
};

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseConversations.mockReturnValue({
    conversations: [],
    isLoading: false,
    isError: false,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  });
});

describe("ConversationList", () => {
  it("shows skeleton while loading", () => {
    mockUseConversations.mockReturnValue({
      conversations: [],
      isLoading: true,
      isError: false,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });

    const { container } = render(<ConversationList />, { wrapper: makeWrapper() });
    expect(container.querySelector("[aria-busy='true']")).toBeInTheDocument();
  });

  it("shows empty state when no conversations", () => {
    render(<ConversationList />, { wrapper: makeWrapper() });
    // ChatEmptyState renders t("title") = "title"
    expect(screen.getByText("title")).toBeInTheDocument();
  });

  it("renders conversation items when conversations exist", () => {
    mockUseConversations.mockReturnValue({
      conversations: [mockConv],
      isLoading: false,
      isError: false,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });

    render(<ConversationList />, { wrapper: makeWrapper() });
    expect(screen.getByText("Ada Okonkwo")).toBeInTheDocument();
  });

  it("shows error message when fetch fails", () => {
    mockUseConversations.mockReturnValue({
      conversations: [],
      isLoading: false,
      isError: true,
      error: new Error("fetch failed"),
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });

    render(<ConversationList />, { wrapper: makeWrapper() });
    expect(screen.getByText("errors.fetchFailed")).toBeInTheDocument();
  });
});
