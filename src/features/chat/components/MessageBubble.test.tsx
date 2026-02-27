import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
};

const otherMessage: ChatMessage = {
  messageId: "msg-2",
  conversationId: CONV_ID,
  senderId: "other-user",
  content: "Hey!",
  contentType: "text",
  createdAt: BASE_TIME,
};

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

  describe("system messages", () => {
    const systemMessage: ChatMessage = {
      messageId: "sys-1",
      conversationId: CONV_ID,
      senderId: USER_ID,
      content: "Ada was added to the conversation",
      contentType: "system" as const,
      createdAt: BASE_TIME,
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
});
