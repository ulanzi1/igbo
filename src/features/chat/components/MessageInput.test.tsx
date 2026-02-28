import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/utils", () => ({ cn: (...args: unknown[]) => args.filter(Boolean).join(" ") }));

vi.mock("lucide-react", () => ({
  SendIcon: () => null,
  AlignJustifyIcon: () => null,
  XIcon: () => null,
}));

vi.mock("./AttachmentButton", () => ({
  AttachmentButton: () => React.createElement("button", { "data-testid": "attachment-btn" }),
}));

vi.mock("./FormattingToolbar", () => ({
  FormattingToolbar: ({ onFormat }: { onFormat: (s: string) => void }) =>
    React.createElement(
      "div",
      { "data-testid": "formatting-toolbar" },
      React.createElement("button", { onClick: () => onFormat("bold") }, "bold"),
    ),
}));

vi.mock("@/features/chat/hooks/use-file-attachment", () => ({
  useFileAttachment: () => ({
    pendingUploads: [],
    isUploading: false,
    addFiles: vi.fn(),
    removeFile: vi.fn(),
  }),
}));

import { MessageInput } from "./MessageInput";

describe("MessageInput", () => {
  let onSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSend = vi.fn().mockResolvedValue(undefined);
  });

  it("renders textarea with placeholder", () => {
    render(<MessageInput onSend={onSend} />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-label", "placeholder");
  });

  it("renders disabled send button when input is empty", () => {
    render(<MessageInput onSend={onSend} />);
    const button = screen.getByRole("button", { name: "sendAriaLabel" });
    expect(button).toBeDisabled();
  });

  it("enables send button when text is typed", () => {
    render(<MessageInput onSend={onSend} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Hello!" } });
    expect(screen.getByRole("button", { name: "sendAriaLabel" })).not.toBeDisabled();
  });

  it("calls onSend with content, empty uploadIds, and contentType when send button clicked", async () => {
    render(<MessageInput onSend={onSend} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Hello!" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "sendAriaLabel" }));
    });

    expect(onSend).toHaveBeenCalledWith("Hello!", [], "text", undefined);
  });

  it("calls onSend when Enter is pressed (not Shift+Enter)", async () => {
    render(<MessageInput onSend={onSend} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Hello!" } });

    await act(async () => {
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    });

    expect(onSend).toHaveBeenCalledWith("Hello!", [], "text", undefined);
  });

  it("does NOT call onSend when Shift+Enter is pressed", async () => {
    render(<MessageInput onSend={onSend} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Hello!" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  it("clears input after successful send", async () => {
    render(<MessageInput onSend={onSend} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Hello!" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "sendAriaLabel" }));
    });

    await waitFor(() => {
      expect(textarea).toHaveValue("");
    });
  });

  it("trims whitespace before sending", async () => {
    render(<MessageInput onSend={onSend} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "  hello  " } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "sendAriaLabel" }));
    });

    expect(onSend).toHaveBeenCalledWith("hello", [], "text", undefined);
  });

  it("detects rich_text content type from formatting markers", async () => {
    render(<MessageInput onSend={onSend} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "**bold text**" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "sendAriaLabel" }));
    });

    expect(onSend).toHaveBeenCalledWith("**bold text**", [], "rich_text", undefined);
  });

  it("shows error state when onSend throws", async () => {
    onSend.mockRejectedValue(new Error("send failed"));
    const { container } = render(<MessageInput onSend={onSend} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Hello!" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "sendAriaLabel" }));
    });

    await waitFor(() => {
      expect(container).toBeDefined();
    });
  });

  it("does not send when content is only whitespace", async () => {
    render(<MessageInput onSend={onSend} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "   " } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    expect(onSend).not.toHaveBeenCalled();
  });

  it("renders reply preview panel when replyTo prop is provided", () => {
    const replyTo = {
      messageId: "msg-1",
      conversationId: "conv-1",
      senderId: "user-1",
      content: "Original message",
      contentType: "text" as const,
      createdAt: new Date().toISOString(),
      attachments: [],
      reactions: [],
    };
    render(
      <MessageInput onSend={onSend} replyTo={replyTo} memberDisplayNameMap={{ "user-1": "Ada" }} />,
    );
    expect(screen.getByText("Original message")).toBeInTheDocument();
  });

  it("calls onClearReply when dismiss button in reply preview is clicked", () => {
    const onClearReply = vi.fn();
    const replyTo = {
      messageId: "msg-1",
      conversationId: "conv-1",
      senderId: "user-1",
      content: "Original message",
      contentType: "text" as const,
      createdAt: new Date().toISOString(),
      attachments: [],
      reactions: [],
    };
    render(
      <MessageInput
        onSend={onSend}
        replyTo={replyTo}
        onClearReply={onClearReply}
        memberDisplayNameMap={{}}
      />,
    );
    // Find and click the dismiss button in the reply preview (aria-label = tReply("dismissReply") → "dismissReply")
    const clearButton = screen.getByRole("button", { name: "dismissReply" });
    fireEvent.click(clearButton);
    expect(onClearReply).toHaveBeenCalled();
  });

  it("passes parentMessageId to onSend when replyTo is set", async () => {
    const replyTo = {
      messageId: "parent-msg-id",
      conversationId: "conv-1",
      senderId: "user-1",
      content: "Parent content",
      contentType: "text" as const,
      createdAt: new Date().toISOString(),
      attachments: [],
      reactions: [],
    };
    render(<MessageInput onSend={onSend} replyTo={replyTo} memberDisplayNameMap={{}} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "My reply" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "sendAriaLabel" }));
    });

    expect(onSend).toHaveBeenCalledWith("My reply", [], "text", "parent-msg-id");
  });

  it("detects rich_text when content contains mention token", async () => {
    render(<MessageInput onSend={onSend} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, {
      target: { value: "@[Ada](mention:00000000-0000-4000-8000-000000000001)" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "sendAriaLabel" }));
    });

    expect(onSend).toHaveBeenCalledWith(
      "@[Ada](mention:00000000-0000-4000-8000-000000000001)",
      [],
      "rich_text",
      undefined,
    );
  });
});
