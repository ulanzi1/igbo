// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import React from "react";

// ── i18n mock ──────────────────────────────────────────────────────────────────
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      noConversations: "No conversations yet",
    };
    return map[key] ?? key;
  },
}));

// ── useConversationList mock ───────────────────────────────────────────────────
vi.mock("@/hooks/use-conversation-list", () => ({
  useConversationList: vi.fn(),
}));

// ── ConversationListItem mock ──────────────────────────────────────────────────
vi.mock("./ConversationListItem", () => ({
  ConversationListItem: ({
    conversation,
  }: {
    conversation: { id: string; otherMember: { displayName: string } };
  }) => <li data-testid={`item-${conversation.id}`}>{conversation.otherMember.displayName}</li>,
}));

// ── Skeleton mock ──────────────────────────────────────────────────────────────
vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

import { ConversationListView } from "./ConversationListView";
import { useConversationList } from "@/hooks/use-conversation-list";
import type { ConversationPreview } from "@/hooks/use-conversation-list";

// ── fixtures ───────────────────────────────────────────────────────────────────
const sampleConv: ConversationPreview = {
  id: "conv-1",
  applicationId: "app-1",
  portalContext: { jobId: "j1", companyId: "c1", jobTitle: "Engineer", companyName: "Acme" },
  otherMember: { id: "u1", displayName: "Jane Smith", photoUrl: null },
  lastMessage: null,
  updatedAt: new Date().toISOString(),
  unreadCount: 0,
};

const defaultReturn = {
  conversations: [],
  isLoading: false,
  hasMore: false,
  loadMore: vi.fn(),
  resetConversationUnread: vi.fn(),
};

// ── IntersectionObserver infrastructure ───────────────────────────────────────
// Arrow fns can't be constructors; use a class that captures the callback by
// closing over a module-level variable reset in beforeEach.
let capturedCallback: IntersectionObserverCallback | null = null;
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();

class MockIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    capturedCallback = callback;
  }
  observe = mockObserve;
  disconnect = mockDisconnect;
  unobserve = vi.fn();
  root: null = null;
  rootMargin = "";
  thresholds: number[] = [];
  takeRecords = () => [];
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedCallback = null;
  mockObserve.mockReset();
  mockDisconnect.mockReset();
  vi.mocked(useConversationList).mockReturnValue({ ...defaultReturn });
  global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
});

describe("ConversationListView", () => {
  it("renders list of conversations", () => {
    vi.mocked(useConversationList).mockReturnValue({
      ...defaultReturn,
      conversations: [sampleConv],
    });
    render(<ConversationListView />);
    expect(screen.getByTestId("conversations-list")).toBeTruthy();
    expect(screen.getByTestId("item-conv-1")).toBeTruthy();
    expect(screen.getByText("Jane Smith")).toBeTruthy();
  });

  it("shows loading skeleton while fetching (no conversations yet)", () => {
    vi.mocked(useConversationList).mockReturnValue({
      ...defaultReturn,
      isLoading: true,
      conversations: [],
    });
    render(<ConversationListView />);
    expect(screen.getByTestId("conversations-loading")).toBeTruthy();
    const skeletons = screen.getAllByTestId("skeleton");
    expect(skeletons.length).toBe(3);
    expect(screen.queryByTestId("conversations-list")).toBeNull();
  });

  it("shows empty state when no conversations and not loading", () => {
    vi.mocked(useConversationList).mockReturnValue({
      ...defaultReturn,
      isLoading: false,
      conversations: [],
    });
    render(<ConversationListView />);
    expect(screen.getByTestId("conversations-empty")).toBeTruthy();
    expect(screen.getByText("No conversations yet")).toBeTruthy();
    expect(screen.queryByTestId("conversations-list")).toBeNull();
  });

  it("renders sentinel when hasMore is true", () => {
    vi.mocked(useConversationList).mockReturnValue({
      ...defaultReturn,
      conversations: [sampleConv],
      hasMore: true,
    });
    render(<ConversationListView />);
    expect(screen.getByTestId("conversations-sentinel")).toBeTruthy();
  });

  it("does not render sentinel when hasMore is false", () => {
    vi.mocked(useConversationList).mockReturnValue({
      ...defaultReturn,
      conversations: [sampleConv],
      hasMore: false,
    });
    render(<ConversationListView />);
    expect(screen.queryByTestId("conversations-sentinel")).toBeNull();
  });

  it("IntersectionObserver triggers loadMore when sentinel intersects", () => {
    const loadMore = vi.fn();
    vi.mocked(useConversationList).mockReturnValue({
      ...defaultReturn,
      conversations: [sampleConv],
      hasMore: true,
      loadMore,
    });

    render(<ConversationListView />);

    expect(capturedCallback).not.toBeNull();
    expect(mockObserve).toHaveBeenCalledOnce();

    act(() => {
      capturedCallback!(
        [{ isIntersecting: true }] as unknown as IntersectionObserverEntry[],
        {} as IntersectionObserver,
      );
    });

    expect(loadMore).toHaveBeenCalledOnce();
  });

  it("does not set up IntersectionObserver when hasMore is false", () => {
    vi.mocked(useConversationList).mockReturnValue({
      ...defaultReturn,
      conversations: [sampleConv],
      hasMore: false,
    });
    render(<ConversationListView />);
    // observer should NOT be created (hasMore=false returns early)
    expect(mockObserve).not.toHaveBeenCalled();
  });

  it("still shows list when loading but conversations already exist", () => {
    vi.mocked(useConversationList).mockReturnValue({
      ...defaultReturn,
      isLoading: true,
      conversations: [sampleConv],
    });
    render(<ConversationListView />);
    // isLoading=true but conversations.length > 0 → show list, not skeleton
    expect(screen.getByTestId("conversations-list")).toBeTruthy();
    expect(screen.queryByTestId("conversations-loading")).toBeNull();
  });
});
