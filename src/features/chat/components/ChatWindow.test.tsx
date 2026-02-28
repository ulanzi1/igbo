import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "user-1" } } }),
}));

vi.mock("@/providers/SocketProvider", () => ({
  useSocketContext: () => ({
    chatSocket: null,
    notificationsSocket: null,
    isConnected: false,
  }),
}));

const mockEditMessage = vi.fn().mockResolvedValue({ success: true });
const mockDeleteMessage = vi.fn().mockResolvedValue({ success: true });

vi.mock("@/features/chat/hooks/use-chat", () => ({
  useChat: () => ({
    messages: [],
    sendMessage: vi.fn().mockResolvedValue({ messageId: "msg-ack" }),
    editMessage: mockEditMessage,
    deleteMessage: mockDeleteMessage,
    clearMessages: vi.fn(),
    isConnected: false,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
    open ? React.createElement("div", { "data-testid": "alert-dialog" }, children) : null,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  AlertDialogAction: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) =>
    React.createElement("button", { "data-testid": "confirm-delete", onClick }, children),
  AlertDialogCancel: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) =>
    React.createElement("button", { "data-testid": "cancel-delete", onClick }, children),
}));

vi.mock("./MessageBubble", () => ({
  MessageBubble: ({
    message,
    onEdit,
    onDelete,
    onReply,
  }: {
    message: {
      content: string;
      messageId: string;
      senderId: string;
      conversationId: string;
      contentType: string;
      createdAt: string;
      attachments: unknown[];
      reactions: unknown[];
    };
    onEdit?: (msg: unknown) => void;
    onDelete?: (id: string) => void;
    onReply?: (msg: unknown) => void;
  }) =>
    React.createElement(
      "div",
      { "data-testid": "message-bubble" },
      message.content,
      React.createElement(
        "button",
        { onClick: () => onEdit?.(message), "data-testid": `edit-${message.messageId}` },
        "edit",
      ),
      React.createElement(
        "button",
        {
          onClick: () => onDelete?.(message.messageId),
          "data-testid": `delete-${message.messageId}`,
        },
        "delete",
      ),
      React.createElement(
        "button",
        { onClick: () => onReply?.(message), "data-testid": `reply-${message.messageId}` },
        "reply",
      ),
    ),
}));

vi.mock("./MessageInput", () => ({
  MessageInput: () => React.createElement("div", { "data-testid": "message-input" }),
}));

vi.mock("./ChatWindowSkeleton", () => ({
  ChatWindowSkeleton: () => React.createElement("div", { "data-testid": "skeleton" }),
}));

vi.mock("@/lib/utils", () => ({ cn: (...args: unknown[]) => args.filter(Boolean).join(" ") }));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement("a", { href }, children),
}));

vi.mock("./GroupAvatarStack", () => ({
  GroupAvatarStack: () => React.createElement("div", { "data-testid": "group-avatar-stack" }),
}));

vi.mock("./GroupInfoPanel", () => ({
  GroupInfoPanel: () => React.createElement("div", { "data-testid": "group-info-panel" }),
}));

// Mock scrollIntoView — not available in jsdom
window.HTMLElement.prototype.scrollIntoView = vi.fn();

const mockConversation = {
  id: "conv-1",
  type: "direct",
  otherMember: { id: "user-2", displayName: "Alice", photoUrl: null },
};

const mockMessages = [
  {
    messageId: "msg-1",
    conversationId: "conv-1",
    senderId: "user-2",
    content: "Hello there!",
    contentType: "text",
    createdAt: new Date().toISOString(),
  },
];

global.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
  if (typeof url === "string" && url.includes("/messages")) {
    return Promise.resolve({
      ok: true,
      json: async () => ({
        data: { messages: mockMessages, meta: { cursor: null, hasMore: false } },
      }),
    });
  }
  if (typeof url === "string" && url.includes("/conversations/") && opts?.method === "PATCH") {
    return Promise.resolve({ ok: true, json: async () => ({ data: { ok: true } }) });
  }
  // GET /api/v1/conversations/[id] — conversation details
  if (typeof url === "string" && url.includes("/conversations/")) {
    return Promise.resolve({
      ok: true,
      json: async () => ({ data: { conversation: mockConversation } }),
    });
  }
  return Promise.resolve({ ok: true, json: async () => ({ data: {} }) });
});

import { ChatWindow } from "./ChatWindow";

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Re-mock scrollIntoView after clearAllMocks
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
    (url: string, opts?: RequestInit) => {
      if (typeof url === "string" && url.includes("/messages")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: { messages: mockMessages, meta: { cursor: null, hasMore: false } },
          }),
        });
      }
      if (typeof url === "string" && url.includes("/conversations/") && opts?.method === "PATCH") {
        return Promise.resolve({ ok: true, json: async () => ({ data: { ok: true } }) });
      }
      if (typeof url === "string" && url.includes("/conversations/")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { conversation: mockConversation } }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ data: {} }) });
    },
  );
});

describe("ChatWindow", () => {
  it("renders message bubbles from API response", async () => {
    render(<ChatWindow conversationId="conv-1" />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getAllByTestId("message-bubble")).toHaveLength(1);
    });
    expect(screen.getByText("Hello there!")).toBeInTheDocument();
  });

  it("renders message input", async () => {
    render(<ChatWindow conversationId="conv-1" />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId("message-input")).toBeInTheDocument();
    });
  });

  it("shows error state when fetch fails", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });

    render(<ChatWindow conversationId="conv-1" />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByText("errors.fetchFailed")).toBeInTheDocument();
    });
  });

  it("calls PATCH to mark conversation as read on mount", async () => {
    render(<ChatWindow conversationId="conv-1" />, { wrapper: makeWrapper() });

    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const patchCall = calls.find(
        (c: unknown[]) =>
          typeof c[0] === "string" &&
          c[0].includes("/conversations/conv-1") &&
          !c[0].includes("/messages"),
      );
      expect(patchCall).toBeTruthy();
    });
  });

  it("renders the chat header with other member's name", async () => {
    render(<ChatWindow conversationId="conv-1" />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId("chat-header")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });
  });

  it("shows reconnecting indicator when socket is disconnected", async () => {
    render(<ChatWindow conversationId="conv-1" />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId("reconnecting-indicator")).toBeInTheDocument();
    });
    expect(screen.getByText("status.reconnecting")).toBeInTheDocument();
  });

  it("delete confirmation dialog is not shown by default", async () => {
    render(<ChatWindow conversationId="conv-1" />, { wrapper: makeWrapper() });
    await waitFor(() => screen.getByTestId("message-bubble"));
    expect(screen.queryByTestId("alert-dialog")).not.toBeInTheDocument();
  });

  it("shows delete confirmation dialog when delete is triggered for a message", async () => {
    const { fireEvent: fe } = await import("@testing-library/react");
    render(<ChatWindow conversationId="conv-1" />, { wrapper: makeWrapper() });
    await waitFor(() => screen.getByTestId("message-bubble"));
    fe.click(screen.getByTestId("delete-msg-1"));
    expect(screen.getByTestId("alert-dialog")).toBeInTheDocument();
  });

  it("calls deleteMessage and closes dialog when confirm delete is clicked", async () => {
    const { fireEvent: fe } = await import("@testing-library/react");
    render(<ChatWindow conversationId="conv-1" />, { wrapper: makeWrapper() });
    await waitFor(() => screen.getByTestId("message-bubble"));
    fe.click(screen.getByTestId("delete-msg-1"));
    expect(screen.getByTestId("alert-dialog")).toBeInTheDocument();
    fe.click(screen.getByTestId("confirm-delete"));
    await waitFor(() => {
      expect(mockDeleteMessage).toHaveBeenCalledWith("msg-1", "conv-1");
    });
  });
});
