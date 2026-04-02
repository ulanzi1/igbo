import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ conversationId: undefined }),
  usePathname: () => "/chat",
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement("a", { href }, children),
}));

vi.mock("@/providers/SocketProvider", () => ({
  useSocketContext: () => ({ chatSocket: null, notificationsSocket: null, isConnected: false }),
}));

vi.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/features/chat/components/ConversationList", () => ({
  ConversationList: () => React.createElement("div", { "data-testid": "conversation-list" }),
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import ChatLayout from "./layout";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ChatLayout", () => {
  it("renders children in the main content area", () => {
    render(
      <ChatLayout>
        <div data-testid="child-content">Child</div>
      </ChatLayout>,
    );
    expect(screen.getByTestId("child-content")).toBeInTheDocument();
  });

  it("renders the ConversationList sidebar for tablet+ (hidden on mobile via CSS)", () => {
    render(
      <ChatLayout>
        <div>Content</div>
      </ChatLayout>,
    );
    // The sidebar element is always in the DOM (CSS hides it on mobile via 'hidden md:flex')
    expect(screen.getByTestId("conversation-sidebar")).toBeInTheDocument();
  });

  it("renders the chat layout container", () => {
    render(
      <ChatLayout>
        <div>Content</div>
      </ChatLayout>,
    );
    expect(screen.getByTestId("chat-layout")).toBeInTheDocument();
  });

  it("sidebar contains ConversationList", () => {
    render(
      <ChatLayout>
        <div>Content</div>
      </ChatLayout>,
    );
    const sidebar = screen.getByTestId("conversation-sidebar");
    expect(sidebar).toContainElement(screen.getByTestId("conversation-list"));
  });
});
