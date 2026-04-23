// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor, fireEvent } from "@testing-library/react";
import React from "react";

// ── session mock ──────────────────────────────────────────────────────────────
const sessionState: { data: { user: { id: string } } | null } = {
  data: { user: { id: "user-1" } },
};

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: sessionState.data, status: "authenticated" }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ── i18n mock ─────────────────────────────────────────────────────────────────
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    if (key === "typing" && params?.name) return `${params.name} is typing...`;
    const map: Record<string, string> = {
      "Portal.messages.today": "Today",
      "Portal.messages.empty": "No messages yet",
      "Portal.messages.loading": "Loading",
      "Portal.messages.threadAriaLabel": "Conversation messages",
      "Portal.messages.readOnlyBanner": "This conversation is closed.",
      "Portal.messages.newMessageIndicator": "New message ↓",
      "Portal.messages.inputAriaLabel": "Message",
      "Portal.messages.inputPlaceholder": "Type a message…",
      "Portal.messages.send": "Send",
      "Portal.messages.sendAriaLabel": "Send message",
      today: "Today",
      yesterday: "Yesterday",
      empty: "No messages yet",
      loading: "Loading",
      threadAriaLabel: "Conversation messages",
      readOnlyBanner: "This conversation is closed.",
      newMessageIndicator: "New message ↓",
      inputAriaLabel: "Message",
      inputPlaceholder: "Type a message…",
      send: "Send",
      sendAriaLabel: "Send message",
      connectionLost: "Connection lost.",
      reconnecting: "Reconnecting…",
      retryPrompt: "Failed to send. Tap to retry.",
      typingUnknown: "Typing...",
    };
    return map[key] ?? key;
  },
}));

// ── density mock ──────────────────────────────────────────────────────────────
vi.mock("@/providers/density-context", () => ({
  useDensity: () => ({ density: "comfortable", setDensity: () => undefined }),
  DensityProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ROLE_DENSITY_DEFAULTS: {},
}));

// ── usePortalSocket mock ─────────────────────────────────────────────────────
const mockSocketEmit = vi.fn();
const socketState = { socket: null as { emit: typeof mockSocketEmit } | null };

vi.mock("@/providers/SocketProvider", () => ({
  usePortalSocket: () => ({
    portalSocket: socketState.socket,
    isConnected: true,
    connectionPhase: "connected",
  }),
}));

// ── usePortalMessages mock ────────────────────────────────────────────────────
const messagesState: {
  messages: unknown[];
  isLoading: boolean;
  hasMore: boolean;
} = { messages: [], isLoading: false, hasMore: false };

const mockLoadOlder = vi.fn();
const mockSendMessage = vi.fn();

vi.mock("@/hooks/use-portal-messages", () => ({
  usePortalMessages: () => ({
    ...messagesState,
    loadOlder: mockLoadOlder,
    sendMessage: mockSendMessage,
    retryMessage: vi.fn(),
  }),
}));

// ── useTypingIndicator mock ───────────────────────────────────────────────────
const typingState: { typingUserId: string | null } = { typingUserId: null };
const mockEmitTypingStart = vi.fn();
const mockEmitTypingStop = vi.fn();

vi.mock("@/hooks/use-typing-indicator", () => ({
  useTypingIndicator: () => ({
    typingUserId: typingState.typingUserId,
    emitTypingStart: mockEmitTypingStart,
    emitTypingStop: mockEmitTypingStop,
  }),
}));

import { ConversationThread } from "./ConversationThread";

const APP_ID = "00000000-0000-4000-8000-000000000001";

const makeMsg = (id: string, content = "Hello", senderId = "user-1") => ({
  id,
  conversationId: "conv-1",
  senderId,
  content,
  contentType: "text",
  parentMessageId: null,
  editedAt: null,
  deletedAt: null,
  createdAt: new Date().toISOString(),
});

beforeEach(() => {
  vi.clearAllMocks();
  messagesState.messages = [];
  messagesState.isLoading = false;
  messagesState.hasMore = false;
  sessionState.data = { user: { id: "user-1" } };
  socketState.socket = null;
  mockSocketEmit.mockReset();
  typingState.typingUserId = null;
  mockEmitTypingStart.mockReset();
  mockEmitTypingStop.mockReset();
});

describe("ConversationThread", () => {
  it("renders the message log region", () => {
    const { getByRole } = render(<ConversationThread applicationId={APP_ID} />);
    expect(getByRole("log", { name: "Conversation messages" })).toBeDefined();
  });

  it("shows empty state when no messages", () => {
    messagesState.messages = [];
    const { getByText } = render(<ConversationThread applicationId={APP_ID} />);
    expect(getByText("No messages yet")).toBeDefined();
  });

  it("renders loading skeleton when isLoading and no messages", () => {
    messagesState.isLoading = true;
    messagesState.messages = [];
    const { getByLabelText } = render(<ConversationThread applicationId={APP_ID} />);
    expect(getByLabelText("Loading")).toBeDefined();
  });

  it("renders messages", () => {
    messagesState.messages = [
      makeMsg("msg-1", "Hello from me"),
      makeMsg("msg-2", "Hi back", "user-2"),
    ];
    const { getByText } = render(<ConversationThread applicationId={APP_ID} />);
    expect(getByText("Hello from me")).toBeDefined();
    expect(getByText("Hi back")).toBeDefined();
  });

  it("renders MessageInput when not readOnly", () => {
    const { getByRole } = render(<ConversationThread applicationId={APP_ID} readOnly={false} />);
    expect(getByRole("textbox", { name: "Message" })).toBeDefined();
  });

  it("shows read-only banner when readOnly=true", () => {
    const { getByRole, queryByRole } = render(
      <ConversationThread applicationId={APP_ID} readOnly={true} />,
    );
    expect(getByRole("status")).toHaveTextContent("This conversation is closed.");
    expect(queryByRole("textbox")).toBeNull();
  });

  it("calls sendMessage when user submits a message", async () => {
    mockSendMessage.mockResolvedValue(undefined);
    const { getByRole } = render(<ConversationThread applicationId={APP_ID} />);

    const textarea = getByRole("textbox", { name: "Message" });
    fireEvent.change(textarea, { target: { value: "Test message" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledWith("Test message"));
  });

  it("does not show empty state when loading", () => {
    messagesState.isLoading = true;
    messagesState.messages = [];
    const { queryByText } = render(<ConversationThread applicationId={APP_ID} />);
    // empty state should not show when loading
    expect(queryByText("No messages yet")).toBeNull();
  });

  it("renders date separator between messages on different days", () => {
    const msg1 = {
      ...makeMsg("msg-1", "Old"),
      createdAt: "2026-04-22T10:00:00.000Z",
    };
    const msg2 = {
      ...makeMsg("msg-2", "New"),
      createdAt: new Date().toISOString(),
    };
    messagesState.messages = [msg1, msg2];

    const { getAllByRole } = render(<ConversationThread applicationId={APP_ID} />);
    // There should be 2 date separators (one for each day)
    expect(getAllByRole("separator")).toHaveLength(2);
  });

  it("emits message:read when mounted with messages from other participant", async () => {
    socketState.socket = { emit: mockSocketEmit };
    messagesState.messages = [makeMsg("msg-1", "Hi from other", "user-2")];

    render(<ConversationThread applicationId={APP_ID} conversationId="conv-1" />);

    await waitFor(() =>
      expect(mockSocketEmit).toHaveBeenCalledWith("message:read", { conversationId: "conv-1" }),
    );
  });

  it("does NOT emit message:read when all messages are from self", async () => {
    socketState.socket = { emit: mockSocketEmit };
    // All messages from "user-1" (the current user from sessionState)
    messagesState.messages = [makeMsg("msg-1", "My message", "user-1")];

    render(<ConversationThread applicationId={APP_ID} conversationId="conv-1" />);

    // Give effect time to run
    await new Promise((r) => setTimeout(r, 20));
    const readCalls = mockSocketEmit.mock.calls.filter(
      (call: unknown[]) => call[0] === "message:read",
    );
    expect(readCalls).toHaveLength(0);
  });

  it("does NOT emit message:read when socket is null", async () => {
    socketState.socket = null;
    messagesState.messages = [makeMsg("msg-1", "Hi from other", "user-2")];

    render(<ConversationThread applicationId={APP_ID} conversationId="conv-1" />);

    await new Promise((r) => setTimeout(r, 20));
    expect(mockSocketEmit).not.toHaveBeenCalled();
  });

  it("shows typing indicator when typingUserId is set", () => {
    typingState.typingUserId = "user-2";
    const { getByTestId } = render(
      <ConversationThread applicationId={APP_ID} otherParticipantName="Bob" />,
    );
    expect(getByTestId("typing-indicator")).toBeDefined();
  });

  it("does NOT show typing indicator when typingUserId is null", () => {
    typingState.typingUserId = null;
    const { queryByTestId } = render(<ConversationThread applicationId={APP_ID} />);
    expect(queryByTestId("typing-indicator")).toBeNull();
  });

  it("does NOT show typing indicator when readOnly is true", () => {
    typingState.typingUserId = "user-2";
    const { queryByTestId } = render(<ConversationThread applicationId={APP_ID} readOnly={true} />);
    expect(queryByTestId("typing-indicator")).toBeNull();
  });

  it("emitTypingStop is called when user sends a message", async () => {
    mockSendMessage.mockResolvedValue(undefined);
    const { getByRole } = render(<ConversationThread applicationId={APP_ID} />);

    const textarea = getByRole("textbox", { name: "Message" });
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    await waitFor(() => expect(mockEmitTypingStop).toHaveBeenCalled());
  });
});
