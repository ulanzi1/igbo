// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => {
    const messages: Record<string, Record<string, string>> = {
      "Chat.typing": {
        userTyping: "{name} is typing...",
        twoUsersTyping: "{name1} and {name2} are typing...",
        manyUsersTyping: "{count} members are typing...",
        unknownUser: "Someone",
      },
    };
    return (key: string, params?: Record<string, unknown>) => {
      let msg = messages[ns]?.[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          msg = msg.replace(`{${k}}`, String(v));
        }
      }
      return msg;
    };
  },
}));

import { TypingIndicator } from "./TypingIndicator";

const MEMBER_MAP: Record<string, string> = {
  "user-1": "Chidi",
  "user-2": "Ngozi",
  "user-3": "Emeka",
};

describe("TypingIndicator", () => {
  it("returns null when typingUserIds is empty", () => {
    const { container } = render(
      <TypingIndicator typingUserIds={[]} memberDisplayNameMap={MEMBER_MAP} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders single user typing message", () => {
    render(<TypingIndicator typingUserIds={["user-1"]} memberDisplayNameMap={MEMBER_MAP} />);
    expect(screen.getByText("Chidi is typing...")).toBeInTheDocument();
  });

  it("renders two users typing message", () => {
    render(
      <TypingIndicator typingUserIds={["user-1", "user-2"]} memberDisplayNameMap={MEMBER_MAP} />,
    );
    expect(screen.getByText("Chidi and Ngozi are typing...")).toBeInTheDocument();
  });

  it("renders many users typing message for 3+", () => {
    render(
      <TypingIndicator
        typingUserIds={["user-1", "user-2", "user-3"]}
        memberDisplayNameMap={MEMBER_MAP}
      />,
    );
    expect(screen.getByText("3 members are typing...")).toBeInTheDocument();
  });

  it("falls back to 'Someone' for unknown userId", () => {
    render(<TypingIndicator typingUserIds={["unknown-user"]} memberDisplayNameMap={MEMBER_MAP} />);
    expect(screen.getByText("Someone is typing...")).toBeInTheDocument();
  });

  it("has role='status' and aria-live='polite'", () => {
    render(<TypingIndicator typingUserIds={["user-1"]} memberDisplayNameMap={MEMBER_MAP} />);
    const el = screen.getByRole("status");
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("aria-live", "polite");
  });
});
