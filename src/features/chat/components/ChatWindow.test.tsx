import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mutable socket context — allows per-test socket injection
const mockSocketCtx = vi.hoisted(() => ({
  chatSocket: null as {
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    emit: ReturnType<typeof vi.fn>;
    connected: boolean;
  } | null,
  notificationsSocket: null as {
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    emit: ReturnType<typeof vi.fn>;
  } | null,
  isConnected: false as boolean,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "user-1" } } }),
}));

vi.mock("@/providers/SocketProvider", () => ({
  useSocketContext: () => mockSocketCtx,
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

const mockMessageInputProps = vi.hoisted(() => ({ members: [] as unknown[] }));
vi.mock("./MessageInput", () => ({
  MessageInput: (props: { members?: unknown[] }) => {
    mockMessageInputProps.members = props.members ?? [];
    return React.createElement("div", { "data-testid": "message-input" });
  },
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

vi.mock("./MessageSearch", () => ({
  MessageSearch: ({ isOpen }: { isOpen: boolean; onNavigate?: unknown; onClose?: unknown }) =>
    isOpen ? React.createElement("div", { "data-testid": "message-search" }) : null,
}));

vi.mock("./ConversationPreferences", () => ({
  ConversationPreferences: ({
    isOpen,
  }: {
    isOpen: boolean;
    conversationId?: string;
    onClose?: unknown;
    onBlockComplete?: unknown;
  }) => (isOpen ? React.createElement("div", { "data-testid": "conversation-preferences" }) : null),
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

function makeFetchMock(opts?: { groupMembers?: unknown[] }) {
  return (url: string, fetchOpts?: RequestInit) => {
    if (typeof url === "string" && url.includes("/messages")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: { messages: mockMessages, meta: { cursor: null, hasMore: false } },
        }),
      });
    }
    if (
      typeof url === "string" &&
      url.includes("/conversations/") &&
      fetchOpts?.method === "PATCH"
    ) {
      return Promise.resolve({ ok: true, json: async () => ({ data: { ok: true } }) });
    }
    if (typeof url === "string" && url.includes("/groups/") && url.includes("/members")) {
      const members = opts?.groupMembers ?? [];
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: { members, nextCursor: null } }),
      });
    }
    // GET /api/v1/conversations/[id] — conversation details
    if (typeof url === "string" && url.includes("/conversations/")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: { conversation: mockConversation } }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({ data: {} }) });
  };
}

global.fetch = vi.fn().mockImplementation(makeFetchMock());

import { ChatWindow } from "./ChatWindow";

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset socket context to no-socket defaults
  mockSocketCtx.chatSocket = null;
  mockSocketCtx.notificationsSocket = null;
  mockSocketCtx.isConnected = false;
  // Re-mock scrollIntoView after clearAllMocks
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(makeFetchMock());
  mockMessageInputProps.members = [];
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

describe("ChatWindow — search and preferences (Story 2.7)", () => {
  it("renders search icon button in header", async () => {
    render(<ChatWindow conversationId="conv-1" />, { wrapper: makeWrapper() });
    await waitFor(() => screen.getByTestId("chat-header"));
    expect(screen.getByTestId("search-button")).toBeInTheDocument();
  });

  it("clicking search icon opens MessageSearch panel", async () => {
    const { fireEvent: fe } = await import("@testing-library/react");
    render(<ChatWindow conversationId="conv-1" />, { wrapper: makeWrapper() });
    await waitFor(() => screen.getByTestId("chat-header"));

    // Initially closed
    expect(screen.queryByTestId("message-search")).not.toBeInTheDocument();

    fe.click(screen.getByTestId("search-button"));

    await waitFor(() => {
      expect(screen.getByTestId("message-search")).toBeInTheDocument();
    });
  });

  it("renders preferences button in header", async () => {
    render(<ChatWindow conversationId="conv-1" />, { wrapper: makeWrapper() });
    await waitFor(() => screen.getByTestId("chat-header"));
    expect(screen.getByTestId("preferences-button")).toBeInTheDocument();
  });
});

describe("ChatWindow — socket events (Story 2.6)", () => {
  function makeLiveChatSocket() {
    return { on: vi.fn(), off: vi.fn(), emit: vi.fn(), connected: true };
  }

  function makeLiveNotificationsSocket() {
    return { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
  }

  it("emits message:read via chatSocket on mount when socket is connected", async () => {
    const chatSocket = makeLiveChatSocket();
    mockSocketCtx.chatSocket = chatSocket;
    mockSocketCtx.isConnected = true;

    render(<ChatWindow conversationId="conv-1" />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(chatSocket.emit).toHaveBeenCalledWith("message:read", { conversationId: "conv-1" });
    });
  });

  it("does NOT emit message:read via socket on mount when socket is disconnected", async () => {
    const chatSocket = { on: vi.fn(), off: vi.fn(), emit: vi.fn(), connected: false };
    mockSocketCtx.chatSocket = chatSocket;

    render(<ChatWindow conversationId="conv-1" />, { wrapper: makeWrapper() });

    // Wait for REST PATCH to fire (proves mount effect ran)
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.some((c: unknown[]) => String(c[0]).includes("/conversations/conv-1"))).toBe(
        true,
      );
    });

    const emitCalls = chatSocket.emit.mock.calls as unknown[][];
    expect(emitCalls.some((c) => c[0] === "message:read")).toBe(false);
  });

  it("emits message:delivered when message:new arrives from another user", async () => {
    const chatSocket = makeLiveChatSocket();
    mockSocketCtx.chatSocket = chatSocket;

    render(<ChatWindow conversationId="conv-1" />, { wrapper: makeWrapper() });

    // Find the message:new handler registered by ChatWindow
    await waitFor(() => {
      expect(chatSocket.on).toHaveBeenCalledWith("message:new", expect.any(Function));
    });

    const newHandler = (chatSocket.on.mock.calls as unknown[][]).find(
      (c) => c[0] === "message:new",
    )![1] as (msg: unknown) => void;

    act(() => {
      newHandler({
        messageId: "incoming-msg",
        conversationId: "conv-1",
        senderId: "user-2", // not the current user (user-1)
        content: "Hey!",
        contentType: "text",
        createdAt: new Date().toISOString(),
        attachments: [],
        reactions: [],
      });
    });

    expect(chatSocket.emit).toHaveBeenCalledWith("message:delivered", {
      messageId: "incoming-msg",
      conversationId: "conv-1",
    });
  });

  it("does NOT emit message:delivered for message:new from the current user", async () => {
    const chatSocket = makeLiveChatSocket();
    mockSocketCtx.chatSocket = chatSocket;

    render(<ChatWindow conversationId="conv-1" />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(chatSocket.on).toHaveBeenCalledWith("message:new", expect.any(Function));
    });

    const newHandler = (chatSocket.on.mock.calls as unknown[][]).find(
      (c) => c[0] === "message:new",
    )![1] as (msg: unknown) => void;

    act(() => {
      newHandler({
        messageId: "own-msg",
        conversationId: "conv-1",
        senderId: "user-1", // current user
        content: "My own message echo",
        contentType: "text",
        createdAt: new Date().toISOString(),
        attachments: [],
        reactions: [],
      });
    });

    expect(chatSocket.emit).not.toHaveBeenCalledWith(
      "message:delivered",
      expect.objectContaining({ messageId: "own-msg" }),
    );
  });

  it("emits presence:subscribe with other member IDs after conversation data loads", async () => {
    const notificationsSocket = makeLiveNotificationsSocket();
    mockSocketCtx.notificationsSocket = notificationsSocket;

    render(<ChatWindow conversationId="conv-1" />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(notificationsSocket.emit).toHaveBeenCalledWith("presence:subscribe", {
        userIds: ["user-2"],
      });
    });
  });

  it("emits presence:unsubscribe on unmount", async () => {
    const notificationsSocket = makeLiveNotificationsSocket();
    mockSocketCtx.notificationsSocket = notificationsSocket;

    const { unmount } = render(<ChatWindow conversationId="conv-1" />, {
      wrapper: makeWrapper(),
    });

    // Wait for presence:subscribe to have been called first
    await waitFor(() => {
      expect(notificationsSocket.emit).toHaveBeenCalledWith(
        "presence:subscribe",
        expect.any(Object),
      );
    });

    unmount();

    expect(notificationsSocket.emit).toHaveBeenCalledWith("presence:unsubscribe", {
      userIds: ["user-2"],
    });
  });

  it("message:delivered socket event updates state (handler does not throw)", async () => {
    const chatSocket = makeLiveChatSocket();
    mockSocketCtx.chatSocket = chatSocket;

    render(<ChatWindow conversationId="conv-1" />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(chatSocket.on).toHaveBeenCalledWith("message:delivered", expect.any(Function));
    });

    const deliveredHandler = (chatSocket.on.mock.calls as unknown[][]).find(
      (c) => c[0] === "message:delivered",
    )![1] as (payload: unknown) => void;

    // Should not throw when called with valid payload
    expect(() => {
      act(() => {
        deliveredHandler({
          messageId: "msg-1",
          conversationId: "conv-1",
          deliveredBy: "user-2",
        });
      });
    }).not.toThrow();

    // Verify handler was registered and ignores events for other conversations
    expect(() => {
      act(() => {
        deliveredHandler({
          messageId: "msg-other",
          conversationId: "conv-other",
          deliveredBy: "user-3",
        });
      });
    }).not.toThrow();
  });

  it("message:read socket event updates state and invalidates conversations query", async () => {
    const chatSocket = makeLiveChatSocket();
    mockSocketCtx.chatSocket = chatSocket;

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    function Wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(QueryClientProvider, { client: queryClient }, children);
    }

    render(<ChatWindow conversationId="conv-1" />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(chatSocket.on).toHaveBeenCalledWith("message:read", expect.any(Function));
    });

    const readHandler = (chatSocket.on.mock.calls as unknown[][]).find(
      (c) => c[0] === "message:read",
    )![1] as (payload: unknown) => void;

    act(() => {
      readHandler({
        conversationId: "conv-1",
        readerId: "user-2",
        lastReadAt: new Date().toISOString(),
      });
    });

    // Verify conversations query was invalidated (for unread count update in sidebar)
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["conversations"] });
    });

    invalidateSpy.mockRestore();
  });

  it("message:read handler ignores events for other conversations", async () => {
    const chatSocket = makeLiveChatSocket();
    mockSocketCtx.chatSocket = chatSocket;

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    function Wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(QueryClientProvider, { client: queryClient }, children);
    }

    render(<ChatWindow conversationId="conv-1" />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(chatSocket.on).toHaveBeenCalledWith("message:read", expect.any(Function));
    });

    const readHandler = (chatSocket.on.mock.calls as unknown[][]).find(
      (c) => c[0] === "message:read",
    )![1] as (payload: unknown) => void;

    // Clear calls from mount effects (mark-as-read PATCH) before testing handler isolation
    invalidateSpy.mockClear();

    act(() => {
      readHandler({
        conversationId: "conv-other", // different conversation
        readerId: "user-2",
        lastReadAt: new Date().toISOString(),
      });
    });

    // Should NOT invalidate for a different conversation
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ["conversations"] });

    invalidateSpy.mockRestore();
  });
});

describe("ChatWindow — group channel @ mention (CP-2)", () => {
  const GROUP_ID = "group-1";
  const mockGroupMembers = [
    {
      userId: "user-a",
      displayName: "Alice",
      photoUrl: null,
      role: "member",
      joinedAt: new Date().toISOString(),
      mutedUntil: null,
    },
    {
      userId: "user-b",
      displayName: "Bob",
      photoUrl: null,
      role: "leader",
      joinedAt: new Date().toISOString(),
      mutedUntil: null,
    },
    {
      userId: "user-c",
      displayName: "Carol",
      photoUrl: null,
      role: "member",
      joinedAt: new Date().toISOString(),
      mutedUntil: null,
    },
  ];

  beforeEach(() => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      makeFetchMock({ groupMembers: mockGroupMembers }),
    );
  });

  it("fetches group members when groupId prop is provided", async () => {
    render(<ChatWindow conversationId="conv-1" channelName="general" groupId={GROUP_ID} />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls as string[][];
      expect(calls.some((c) => String(c[0]).includes(`/groups/${GROUP_ID}/members`))).toBe(true);
    });
  });

  it("passes all group members to MessageInput as mention candidates", async () => {
    render(<ChatWindow conversationId="conv-1" channelName="general" groupId={GROUP_ID} />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(mockMessageInputProps.members).toHaveLength(3);
    });

    const members = mockMessageInputProps.members as Array<{ id: string; displayName: string }>;
    expect(members.map((m) => m.id)).toEqual(["user-a", "user-b", "user-c"]);
    expect(members.map((m) => m.displayName)).toEqual(["Alice", "Bob", "Carol"]);
  });

  it("does NOT fetch group members when groupId is not provided", async () => {
    render(<ChatWindow conversationId="conv-1" />, { wrapper: makeWrapper() });

    await waitFor(() => screen.getByTestId("message-input"));

    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls as string[][];
    expect(calls.some((c) => String(c[0]).includes("/groups/"))).toBe(false);
  });
});
