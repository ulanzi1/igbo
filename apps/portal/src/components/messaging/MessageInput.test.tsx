// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      inputAriaLabel: "Message",
      inputPlaceholder: "Type a message…",
      send: "Send",
      sendAriaLabel: "Send message",
    };
    return map[key] ?? key;
  },
}));

import { MessageInput } from "./MessageInput";

describe("MessageInput", () => {
  it("renders textarea with aria-label", () => {
    const { getByRole } = render(<MessageInput onSend={vi.fn()} />);
    expect(getByRole("textbox", { name: "Message" })).toBeDefined();
  });

  it("send button is disabled when input is empty", () => {
    const { getByRole } = render(<MessageInput onSend={vi.fn()} />);
    const btn = getByRole("button", { name: "Send message" });
    expect(btn).toBeDisabled();
  });

  it("send button is enabled when input has content", async () => {
    const user = userEvent.setup();
    const { getByRole } = render(<MessageInput onSend={vi.fn()} />);
    const textarea = getByRole("textbox", { name: "Message" });
    await user.type(textarea, "Hello");
    expect(getByRole("button", { name: "Send message" })).not.toBeDisabled();
  });

  it("calls onSend with trimmed content on button click", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    const { getByRole } = render(<MessageInput onSend={onSend} />);
    const textarea = getByRole("textbox", { name: "Message" });
    await user.type(textarea, "  Hi there  ");
    await user.click(getByRole("button", { name: "Send message" }));
    expect(onSend).toHaveBeenCalledWith("Hi there");
  });

  it("clears textarea after sending", async () => {
    const user = userEvent.setup();
    const { getByRole } = render(<MessageInput onSend={vi.fn()} />);
    const textarea = getByRole("textbox", { name: "Message" }) as HTMLTextAreaElement;
    await user.type(textarea, "Hello");
    await user.click(getByRole("button", { name: "Send message" }));
    expect(textarea.value).toBe("");
  });

  it("sends on Enter key press", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    const { getByRole } = render(<MessageInput onSend={onSend} />);
    const textarea = getByRole("textbox", { name: "Message" });
    await user.type(textarea, "Enter test");
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    expect(onSend).toHaveBeenCalledWith("Enter test");
  });

  it("does not send on Shift+Enter (newline)", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    const { getByRole } = render(<MessageInput onSend={onSend} />);
    const textarea = getByRole("textbox", { name: "Message" });
    await user.type(textarea, "Hello");
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("disables textarea and button when disabled=true", () => {
    const { getByRole } = render(<MessageInput onSend={vi.fn()} disabled={true} />);
    expect(getByRole("textbox", { name: "Message" })).toBeDisabled();
    expect(getByRole("button", { name: "Send message" })).toBeDisabled();
  });

  it("disables send button when isSending=true", async () => {
    const user = userEvent.setup();
    const { getByRole } = render(<MessageInput onSend={vi.fn()} isSending={true} />);
    const textarea = getByRole("textbox", { name: "Message" });
    await user.type(textarea, "Hi");
    expect(getByRole("button", { name: "Send message" })).toBeDisabled();
  });

  it("calls onTyping callback on input change", async () => {
    const user = userEvent.setup();
    const onTyping = vi.fn();
    const { getByRole } = render(<MessageInput onSend={vi.fn()} onTyping={onTyping} />);
    const textarea = getByRole("textbox", { name: "Message" });
    await user.type(textarea, "H");
    expect(onTyping).toHaveBeenCalled();
  });

  it("calls onTypingStop callback when message is sent", async () => {
    const user = userEvent.setup();
    const onTypingStop = vi.fn();
    const { getByRole } = render(<MessageInput onSend={vi.fn()} onTypingStop={onTypingStop} />);
    const textarea = getByRole("textbox", { name: "Message" });
    await user.type(textarea, "Hello");
    await user.click(getByRole("button", { name: "Send message" }));
    expect(onTypingStop).toHaveBeenCalled();
  });
});
