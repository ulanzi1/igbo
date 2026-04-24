// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// ── i18n mock ──────────────────────────────────────────────────────────────────
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    if (key === "lastMessageYou") return `You: ${params?.preview ?? ""}`;
    if (key === "conversationWith") return `Chat with ${params?.name ?? ""}`;
    if (key === "unreadBadgeLabel") return `${params?.count ?? "0"} unread messages`;
    if (key === "timeJustNow") return "Just now";
    if (key === "timeMinutesAgo") return `${params?.count ?? "0"}m ago`;
    if (key === "timeHoursAgo") return `${params?.count ?? "0"}h ago`;
    if (key === "timeYesterday") return "Yesterday";
    if (key === "timeDaysAgo") return `${params?.count ?? "0"}d ago`;
    return key;
  },
  useLocale: () => "en",
}));

// ── session mock ───────────────────────────────────────────────────────────────
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "user-1" } },
    status: "authenticated",
  }),
}));

// ── Badge mock ─────────────────────────────────────────────────────────────────
vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
    <span {...props}>{children}</span>
  ),
}));

import { ConversationListItem } from "./ConversationListItem";
import type { ConversationPreview } from "@/hooks/use-conversation-list";

// ── fixtures ───────────────────────────────────────────────────────────────────
const baseConv: ConversationPreview = {
  id: "conv-1",
  applicationId: "app-1",
  portalContext: {
    jobId: "job-1",
    companyId: "comp-1",
    jobTitle: "Software Engineer",
    companyName: "Acme Corp",
  },
  otherMember: { id: "other-1", displayName: "John Doe", photoUrl: null },
  lastMessage: {
    content: "Hello there",
    contentType: "text",
    senderId: "other-1",
    createdAt: new Date().toISOString(),
  },
  updatedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  unreadCount: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ConversationListItem", () => {
  it("renders other party name and job title", () => {
    render(<ConversationListItem conversation={baseConv} />);
    expect(screen.getByText("John Doe")).toBeTruthy();
    expect(screen.getByText("Software Engineer")).toBeTruthy();
  });

  it("renders last message preview", () => {
    render(<ConversationListItem conversation={baseConv} />);
    expect(screen.getByText("Hello there")).toBeTruthy();
  });

  it("truncates last message to 50 chars", () => {
    const longContent = "A".repeat(60);
    render(
      <ConversationListItem
        conversation={{
          ...baseConv,
          lastMessage: { ...baseConv.lastMessage!, content: longContent },
        }}
      />,
    );
    expect(screen.getByText("A".repeat(50) + "…")).toBeTruthy();
  });

  it("renders 'You: ' prefix for self-sent last message", () => {
    render(
      <ConversationListItem
        conversation={{
          ...baseConv,
          lastMessage: { ...baseConv.lastMessage!, senderId: "user-1" },
        }}
      />,
    );
    expect(screen.getByText("You: Hello there")).toBeTruthy();
  });

  it("renders unread badge when unreadCount > 0", () => {
    render(<ConversationListItem conversation={{ ...baseConv, unreadCount: 5 }} />);
    expect(screen.getByTestId("unread-badge-conv-1")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
  });

  it("does not render unread badge when unreadCount is 0", () => {
    render(<ConversationListItem conversation={{ ...baseConv, unreadCount: 0 }} />);
    expect(screen.queryByTestId("unread-badge-conv-1")).toBeNull();
  });

  it("shows '99+' for unread count over 99", () => {
    render(<ConversationListItem conversation={{ ...baseConv, unreadCount: 150 }} />);
    expect(screen.getByText("99+")).toBeTruthy();
  });

  it("unread badge has accessible aria-label", () => {
    render(<ConversationListItem conversation={{ ...baseConv, unreadCount: 3 }} />);
    const badge = screen.getByTestId("unread-badge-conv-1");
    expect(badge).toHaveAttribute("aria-label", "3 unread messages");
  });

  it("navigates to correct conversation URL", () => {
    render(<ConversationListItem conversation={baseConv} />);
    const link = screen.getByTestId("conversation-list-item-conv-1");
    expect(link).toHaveAttribute("href", "/en/conversations/app-1");
  });

  it("renders a relative timestamp (~30m ago)", () => {
    render(<ConversationListItem conversation={baseConv} />);
    expect(screen.getByText("30m ago")).toBeTruthy();
  });

  it("shows no last message preview when lastMessage is null", () => {
    render(<ConversationListItem conversation={{ ...baseConv, lastMessage: null }} />);
    expect(screen.queryByText("Hello there")).toBeNull();
  });

  it("renders avatar with first letter of display name", () => {
    render(<ConversationListItem conversation={baseConv} />);
    expect(screen.getByText("J")).toBeTruthy();
  });

  it("does not render job title when portalContext is null", () => {
    render(<ConversationListItem conversation={{ ...baseConv, portalContext: null }} />);
    expect(screen.queryByText("Software Engineer")).toBeNull();
  });
});
