import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import type { LocalChatMessage, ChatMessage } from "@/features/chat/types";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/utils", () => ({ cn: (...args: unknown[]) => args.filter(Boolean).join(" ") }));

// Mock DeliveryIndicator to simplify tests
vi.mock("./DeliveryIndicator", () => ({
  DeliveryIndicator: ({ status }: { status: string }) =>
    React.createElement("span", { "data-testid": "delivery" }, status),
}));

vi.mock("./RichTextRenderer", () => ({
  RichTextRenderer: ({ content, className }: { content: string; className?: string }) =>
    React.createElement("span", { "data-testid": "rich-text", className }, content),
}));

vi.mock("./AttachmentGrid", () => ({
  AttachmentGrid: () => React.createElement("div", { "data-testid": "attachment-grid" }),
}));

vi.mock("./ReactionPicker", () => ({
  ReactionPicker: () => React.createElement("div", { "data-testid": "reaction-picker" }),
}));

vi.mock("./ReactionBadges", () => ({
  ReactionBadges: () => React.createElement("div", { "data-testid": "reaction-badges" }),
}));

vi.mock("@/features/chat/hooks/use-reactions", () => ({
  useReactions: () => ({
    reactions: [],
    aggregated: [],
    toggleReaction: vi.fn(),
    applyReactionEvent: vi.fn(),
  }),
}));

vi.mock("@/features/chat/hooks/use-long-press", () => ({
  useLongPress: () => ({
    onTouchStart: vi.fn(),
    onTouchEnd: vi.fn(),
    onTouchMove: vi.fn(),
  }),
}));

import { MessageBubble } from "./MessageBubble";

const BASE_TIME = "2026-02-01T12:00:00Z";
const CONV_ID = "00000000-0000-4000-8000-000000000001";
const USER_ID = "00000000-0000-4000-8000-000000000002";

const ownMessage: LocalChatMessage = {
  messageId: "msg-1",
  conversationId: CONV_ID,
  senderId: USER_ID,
  content: "Hello there!",
  contentType: "text",
  createdAt: BASE_TIME,
  tempId: "temp-1",
  status: "sent",
  attachments: [],
  reactions: [],
};

const otherMessage: ChatMessage = {
  messageId: "msg-2",
  conversationId: CONV_ID,
  senderId: "other-user",
  content: "Hey!",
  contentType: "text",
  createdAt: BASE_TIME,
  attachments: [],
  reactions: [],
};

const MSG_ID_1 = "msg-1";
const MSG_ID_2 = "msg-2";

describe("MessageBubble", () => {
  it("renders own message with delivery indicator", () => {
    render(
      <MessageBubble message={ownMessage} isOwnMessage={true} showAvatar={true} senderName="Me" />,
    );
    expect(screen.getByText("Hello there!")).toBeInTheDocument();
    expect(screen.getByTestId("delivery")).toHaveTextContent("sent");
  });

  it("renders other member's message with avatar when showAvatar=true", () => {
    render(
      <MessageBubble
        message={otherMessage}
        isOwnMessage={false}
        showAvatar={true}
        senderName="Ada Okonkwo"
      />,
    );
    expect(screen.getByText("Hey!")).toBeInTheDocument();
    expect(screen.getByText("Ada Okonkwo")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument(); // avatar initial
  });

  it("hides avatar when showAvatar=false", () => {
    render(
      <MessageBubble
        message={otherMessage}
        isOwnMessage={false}
        showAvatar={false}
        senderName="Ada Okonkwo"
      />,
    );
    expect(screen.queryByText("Ada Okonkwo")).not.toBeInTheDocument();
  });

  it("does not show delivery indicator for other member's messages", () => {
    render(
      <MessageBubble
        message={otherMessage}
        isOwnMessage={false}
        showAvatar={true}
        senderName="Ada"
      />,
    );
    expect(screen.queryByTestId("delivery")).not.toBeInTheDocument();
  });

  it("shows 'sending' status for optimistic messages", () => {
    const sendingMsg: LocalChatMessage = { ...ownMessage, status: "sending" };
    render(
      <MessageBubble message={sendingMsg} isOwnMessage={true} showAvatar={true} senderName="Me" />,
    );
    expect(screen.getByTestId("delivery")).toHaveTextContent("sending");
  });

  it("renders rich_text content via RichTextRenderer", () => {
    const richMsg: LocalChatMessage = {
      ...ownMessage,
      content: "**bold**",
      contentType: "rich_text",
    };
    render(<MessageBubble message={richMsg} isOwnMessage={true} showAvatar={true} />);
    expect(screen.getByTestId("rich-text")).toBeInTheDocument();
    expect(screen.queryByRole("paragraph")).toBeNull();
  });

  describe("system messages", () => {
    const systemMessage: ChatMessage = {
      messageId: "sys-1",
      conversationId: CONV_ID,
      senderId: USER_ID,
      content: "Ada was added to the conversation",
      contentType: "system" as const,
      createdAt: BASE_TIME,
      attachments: [],
      reactions: [],
    };

    it("renders system message with centered, muted styling", () => {
      render(
        <MessageBubble
          message={systemMessage}
          isOwnMessage={false}
          showAvatar={true}
          senderName="System"
        />,
      );
      expect(screen.getByText("Ada was added to the conversation")).toBeInTheDocument();
      const span = screen.getByText("Ada was added to the conversation");
      expect(span.className).toContain("text-muted-foreground");
      expect(span.className).toContain("bg-muted");
      expect(span.className).toContain("text-xs");
    });

    it("does not show avatar for system messages", () => {
      render(
        <MessageBubble
          message={systemMessage}
          isOwnMessage={false}
          showAvatar={true}
          senderName="System"
        />,
      );
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
      // No avatar initial letter either
      expect(screen.queryByText("S")).not.toBeInTheDocument();
    });

    it("does not show delivery indicator for system messages", () => {
      render(
        <MessageBubble
          message={systemMessage}
          isOwnMessage={true}
          showAvatar={true}
          senderName="Me"
        />,
      );
      expect(screen.queryByTestId("delivery")).not.toBeInTheDocument();
    });

    it("does not show sender name for system messages", () => {
      render(
        <MessageBubble
          message={systemMessage}
          isOwnMessage={false}
          showAvatar={true}
          senderName="Ada Okonkwo"
        />,
      );
      expect(screen.queryByText("Ada Okonkwo")).not.toBeInTheDocument();
    });
  });

  describe("deleted message", () => {
    const deletedMessage: ChatMessage = {
      messageId: MSG_ID_2,
      conversationId: CONV_ID,
      senderId: USER_ID,
      content: "",
      contentType: "text" as const,
      createdAt: BASE_TIME,
      deletedAt: "2026-02-01T13:00:00Z",
      attachments: [],
      reactions: [],
    };

    it("renders deleted placeholder instead of content", () => {
      render(
        <MessageBubble
          message={deletedMessage}
          isOwnMessage={true}
          showAvatar={true}
          currentUserId={USER_ID}
        />,
      );
      expect(screen.getByText("messages.deletedMessage")).toBeInTheDocument();
    });

    it("does not render action buttons for deleted messages", () => {
      render(
        <MessageBubble
          message={deletedMessage}
          isOwnMessage={true}
          showAvatar={true}
          currentUserId={USER_ID}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />,
      );
      // No edit/delete/reply buttons visible
      expect(screen.queryByRole("button", { name: "actions.edit" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "actions.delete" })).not.toBeInTheDocument();
    });
  });

  describe("edited indicator", () => {
    it("shows edited label when editedAt is set", () => {
      const editedMessage: ChatMessage = {
        ...otherMessage,
        editedAt: "2026-02-01T12:05:00Z",
      };
      render(<MessageBubble message={editedMessage} isOwnMessage={false} showAvatar={true} />);
      expect(screen.getByText("messages.editedLabel")).toBeInTheDocument();
    });

    it("does not show edited label when editedAt is not set", () => {
      render(<MessageBubble message={otherMessage} isOwnMessage={false} showAvatar={true} />);
      expect(screen.queryByText("messages.editedLabel")).not.toBeInTheDocument();
    });
  });

  describe("reply context", () => {
    const parentMessage: ChatMessage = {
      messageId: "parent-msg",
      conversationId: CONV_ID,
      senderId: "other-user",
      content: "This is the parent message",
      contentType: "text" as const,
      createdAt: BASE_TIME,
      attachments: [],
      reactions: [],
    };

    const replyMessage: ChatMessage = {
      ...otherMessage,
      messageId: MSG_ID_2,
      parentMessageId: "parent-msg",
    };

    it("shows parent message content in reply context", () => {
      render(
        <MessageBubble
          message={replyMessage}
          isOwnMessage={false}
          showAvatar={true}
          allMessages={[parentMessage]}
          memberDisplayNameMap={{ "other-user": "Ada" }}
        />,
      );
      expect(screen.getByText("This is the parent message")).toBeInTheDocument();
    });

    it("shows parent sender name in reply context", () => {
      render(
        <MessageBubble
          message={replyMessage}
          isOwnMessage={false}
          showAvatar={true}
          allMessages={[parentMessage]}
          memberDisplayNameMap={{ "other-user": "Ada Okonkwo" }}
        />,
      );
      expect(screen.getByText("Ada Okonkwo")).toBeInTheDocument();
    });

    it("calls onScrollToMessage when reply context is clicked", () => {
      const onScrollToMessage = vi.fn();
      render(
        <MessageBubble
          message={replyMessage}
          isOwnMessage={false}
          showAvatar={true}
          allMessages={[parentMessage]}
          memberDisplayNameMap={{}}
          onScrollToMessage={onScrollToMessage}
        />,
      );
      // Click the button that contains the parent message text
      const replyContextBtn = screen.getAllByRole("button")[0]!;
      fireEvent.click(replyContextBtn);
      expect(onScrollToMessage).toHaveBeenCalledWith("parent-msg");
    });

    it("shows original message placeholder when parent not in allMessages", () => {
      render(
        <MessageBubble
          message={replyMessage}
          isOwnMessage={false}
          showAvatar={true}
          allMessages={[]} // parent not loaded
          memberDisplayNameMap={{}}
        />,
      );
      expect(screen.getByText("reply.originalMessage")).toBeInTheDocument();
    });
  });

  describe("deliveryStatus prop (server messages)", () => {
    const serverOwnMessage: ChatMessage = {
      messageId: "server-msg-read",
      conversationId: CONV_ID,
      senderId: USER_ID,
      content: "Read by recipient",
      contentType: "text",
      createdAt: BASE_TIME,
      attachments: [],
      reactions: [],
    };

    it("renders deliveryStatus prop when provided for a server message", () => {
      render(
        <MessageBubble
          message={serverOwnMessage}
          isOwnMessage={true}
          showAvatar={false}
          deliveryStatus="read"
        />,
      );
      expect(screen.getByTestId("delivery")).toHaveTextContent("read");
    });

    it("defaults to 'delivered' when deliveryStatus is not provided for a server message", () => {
      render(<MessageBubble message={serverOwnMessage} isOwnMessage={true} showAvatar={false} />);
      expect(screen.getByTestId("delivery")).toHaveTextContent("delivered");
    });
  });

  describe("inline edit mode", () => {
    let onEditSave: ReturnType<typeof vi.fn>;
    let onEditCancel: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      onEditSave = vi.fn().mockResolvedValue(undefined);
      onEditCancel = vi.fn();
    });

    it("shows textarea with current content when editing", () => {
      render(
        <MessageBubble
          message={ownMessage}
          isOwnMessage={true}
          showAvatar={true}
          currentUserId={USER_ID}
          editingMessageId={MSG_ID_1}
          onEditSave={onEditSave}
          onEditCancel={onEditCancel}
        />,
      );
      expect(screen.getByRole("textbox")).toHaveValue("Hello there!");
    });

    it("shows save and cancel buttons when editing", () => {
      render(
        <MessageBubble
          message={ownMessage}
          isOwnMessage={true}
          showAvatar={true}
          currentUserId={USER_ID}
          editingMessageId={MSG_ID_1}
          onEditSave={onEditSave}
          onEditCancel={onEditCancel}
        />,
      );
      // Mock returns key as-is: tEditMessage("save") → "save"
      expect(screen.getByText("save")).toBeInTheDocument();
      expect(screen.getByText("cancel")).toBeInTheDocument();
    });

    it("calls onEditCancel when cancel is clicked", () => {
      render(
        <MessageBubble
          message={ownMessage}
          isOwnMessage={true}
          showAvatar={true}
          currentUserId={USER_ID}
          editingMessageId={MSG_ID_1}
          onEditSave={onEditSave}
          onEditCancel={onEditCancel}
        />,
      );
      fireEvent.click(screen.getByText("cancel"));
      expect(onEditCancel).toHaveBeenCalled();
    });

    it("shows textarea when in edit mode (content is in textarea value)", () => {
      render(
        <MessageBubble
          message={ownMessage}
          isOwnMessage={true}
          showAvatar={true}
          currentUserId={USER_ID}
          editingMessageId={MSG_ID_1}
          onEditSave={onEditSave}
          onEditCancel={onEditCancel}
        />,
      );
      // Textarea is present with the message content as its value
      const textarea = screen.getByRole("textbox");
      expect(textarea).toBeInTheDocument();
      expect(textarea).toHaveValue("Hello there!");
    });
  });
});
