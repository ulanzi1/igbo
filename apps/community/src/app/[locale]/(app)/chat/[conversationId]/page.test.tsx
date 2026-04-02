import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ conversationId: "conv-abc" }),
  usePathname: () => "/chat/conv-abc",
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement("a", { href }, children),
}));

vi.mock("@/features/chat/components/ChatWindow", () => ({
  ChatWindow: ({ conversationId }: { conversationId: string }) =>
    React.createElement("div", { "data-testid": "chat-window", "data-convid": conversationId }),
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import ConversationPage from "./page";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ConversationPage", () => {
  it("renders the ChatWindow with the conversationId from params", () => {
    render(<ConversationPage />);
    const chatWindow = screen.getByTestId("chat-window");
    expect(chatWindow).toBeInTheDocument();
    expect(chatWindow).toHaveAttribute("data-convid", "conv-abc");
  });
});
