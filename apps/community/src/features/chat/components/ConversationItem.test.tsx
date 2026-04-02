import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import type { ChatConversation } from "@/features/chat/types";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    className,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    [k: string]: unknown;
  }) => React.createElement("a", { href, className, ...props }, children),
}));

vi.mock("@/lib/utils", () => ({ cn: (...args: unknown[]) => args.filter(Boolean).join(" ") }));

vi.mock("./GroupAvatarStack", () => ({
  GroupAvatarStack: ({ members }: { members: { displayName: string }[] }) =>
    React.createElement(
      "div",
      { "data-testid": "group-avatar-stack" },
      members.map((m) => m.displayName).join(","),
    ),
}));

import { ConversationItem } from "./ConversationItem";

const CONV_ID = "00000000-0000-4000-8000-000000000001";

const mockConversation: ChatConversation = {
  id: CONV_ID,
  type: "direct",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  otherMember: { id: "user-2", displayName: "Ada Okonkwo", photoUrl: null },
  lastMessage: {
    content: "Hello!",
    contentType: "text",
    senderId: "user-2",
    createdAt: new Date().toISOString(),
  },
  unreadCount: 0,
};

describe("ConversationItem", () => {
  it("renders the other member's display name", () => {
    render(<ConversationItem conversation={mockConversation} />);
    expect(screen.getByText("Ada Okonkwo")).toBeInTheDocument();
  });

  it("renders last message preview", () => {
    render(<ConversationItem conversation={mockConversation} />);
    expect(screen.getByText("Hello!")).toBeInTheDocument();
  });

  it("renders friendly label instead of JSON for shared_post messages", () => {
    const conv: ChatConversation = {
      ...mockConversation,
      lastMessage: {
        content: '{"postId":"de27a7b2-a098-4da0-9abc-def123456789"}',
        contentType: "shared_post",
        senderId: "user-2",
        createdAt: new Date().toISOString(),
      },
    };
    render(<ConversationItem conversation={conv} />);
    expect(screen.getByText("messages.sharedPost")).toBeInTheDocument();
    expect(screen.queryByText(/postId/)).not.toBeInTheDocument();
  });

  it("links to the conversation page", () => {
    render(<ConversationItem conversation={mockConversation} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", `/chat/${CONV_ID}`);
  });

  it("shows unread badge when unreadCount > 0", () => {
    const conv: ChatConversation = { ...mockConversation, unreadCount: 3 };
    render(<ConversationItem conversation={conv} />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("shows 99+ when unread count exceeds 99", () => {
    const conv: ChatConversation = { ...mockConversation, unreadCount: 150 };
    render(<ConversationItem conversation={conv} />);
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("renders avatar with initial when no photo", () => {
    render(<ConversationItem conversation={mockConversation} />);
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("renders active state when isActive=true", () => {
    const { container } = render(<ConversationItem conversation={mockConversation} isActive />);
    const link = container.querySelector("a");
    expect(link?.className).toContain("border-l-primary");
  });

  it("applies aria-current='page' when active", () => {
    render(<ConversationItem conversation={mockConversation} isActive />);
    expect(screen.getByRole("link")).toHaveAttribute("aria-current", "page");
  });
});

describe("ConversationItem — group variant", () => {
  const GROUP_CONV_ID = "00000000-0000-4000-8000-000000000002";
  const groupConversation: ChatConversation = {
    id: GROUP_CONV_ID,
    type: "group",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    otherMember: { id: "user-2", displayName: "Ada", photoUrl: null },
    members: [
      { id: "user-2", displayName: "Ada", photoUrl: null },
      { id: "user-3", displayName: "Chidi", photoUrl: null },
    ],
    memberCount: 3,
    lastMessage: {
      content: "Hey all!",
      contentType: "text",
      senderId: "user-2",
      senderDisplayName: "Ada",
      createdAt: new Date().toISOString(),
    },
    unreadCount: 0,
  };

  it("renders group member names in formatted display name", () => {
    render(<ConversationItem conversation={groupConversation} />);
    // 2 members shown, memberCount=3 → displays "Ada, Chidi, +1"
    expect(screen.getByText("Ada, Chidi, +1")).toBeInTheDocument();
  });

  it("renders GroupAvatarStack for group conversations", () => {
    render(<ConversationItem conversation={groupConversation} />);
    expect(screen.getByTestId("group-avatar-stack")).toBeInTheDocument();
  });

  it("prefixes last message with sender display name for groups", () => {
    render(<ConversationItem conversation={groupConversation} />);
    expect(screen.getByText("Ada: Hey all!")).toBeInTheDocument();
  });

  it("shows overflow count when more than 3 members", () => {
    const bigGroup: ChatConversation = {
      ...groupConversation,
      members: [
        { id: "u1", displayName: "Ada", photoUrl: null },
        { id: "u2", displayName: "Chidi", photoUrl: null },
        { id: "u3", displayName: "Ngozi", photoUrl: null },
      ],
      memberCount: 5,
    };
    render(<ConversationItem conversation={bigGroup} />);
    expect(screen.getByText(/\+2/)).toBeInTheDocument();
  });
});

describe("ConversationItem — online presence dot", () => {
  const conv: ChatConversation = {
    id: "00000000-0000-4000-8000-000000000001",
    type: "direct",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    otherMember: { id: "user-2", displayName: "Ada Okonkwo", photoUrl: null },
    lastMessage: null,
    unreadCount: 0,
  };

  it("renders green dot when isOnline=true", () => {
    render(<ConversationItem conversation={conv} isOnline={true} />);
    expect(screen.getByRole("img", { name: "conversations.online" })).toBeInTheDocument();
  });

  it("does not render green dot when isOnline=false", () => {
    render(<ConversationItem conversation={conv} isOnline={false} />);
    expect(screen.queryByRole("img", { name: "conversations.online" })).not.toBeInTheDocument();
  });

  it("does not render green dot when isOnline is omitted", () => {
    render(<ConversationItem conversation={conv} />);
    expect(screen.queryByRole("img", { name: "conversations.online" })).not.toBeInTheDocument();
  });
});
