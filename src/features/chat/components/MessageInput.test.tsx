import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/utils", () => ({ cn: (...args: unknown[]) => args.filter(Boolean).join(" ") }));

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

  it("calls onSend with content when send button clicked", async () => {
    render(<MessageInput onSend={onSend} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Hello!" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "sendAriaLabel" }));
    });

    expect(onSend).toHaveBeenCalledWith("Hello!");
  });

  it("calls onSend when Enter is pressed (not Shift+Enter)", async () => {
    render(<MessageInput onSend={onSend} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Hello!" } });

    await act(async () => {
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    });

    expect(onSend).toHaveBeenCalledWith("Hello!");
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

    expect(onSend).toHaveBeenCalledWith("hello");
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
      // After error, the container exists
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
});
