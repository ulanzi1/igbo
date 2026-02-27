import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({}),
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

import ChatPage from "./page";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ChatPage", () => {
  it("renders the ConversationList for mobile view", () => {
    render(<ChatPage />);
    expect(screen.getByTestId("conversation-list")).toBeInTheDocument();
  });

  it("renders a select-conversation placeholder for tablet+ view", () => {
    render(<ChatPage />);
    expect(screen.getByTestId("select-conversation-prompt")).toBeInTheDocument();
  });

  it("renders the page title", () => {
    render(<ChatPage />);
    expect(screen.getByText("conversations.title")).toBeInTheDocument();
  });
});
