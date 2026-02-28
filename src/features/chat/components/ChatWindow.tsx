"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, InfoIcon } from "lucide-react";
import { useChat } from "@/features/chat/hooks/use-chat";
import { useNotificationSound } from "@/features/chat/hooks/use-notification-sound";
import { useSocketContext } from "@/providers/SocketProvider";
import { useRouter } from "@/i18n/navigation";
import { MessageBubble } from "./MessageBubble";
import { ChatWindowSkeleton } from "./ChatWindowSkeleton";
import { MessageInput } from "./MessageInput";
import { GroupAvatarStack } from "./GroupAvatarStack";
import { GroupInfoPanel } from "./GroupInfoPanel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import type { ChatMessage, LocalChatMessage } from "@/features/chat/types";
import { useSession } from "next-auth/react";

interface MessagesPage {
  messages: ChatMessage[];
  meta: { cursor: string | null; hasMore: boolean };
}

interface ConversationMember {
  id: string;
  displayName: string;
  photoUrl: string | null;
}

interface ConversationData {
  conversation: {
    id: string;
    type: string;
    otherMember?: ConversationMember;
    members?: ConversationMember[];
    memberCount?: number;
  };
}

async function fetchMessagesPage(conversationId: string, cursor?: string): Promise<MessagesPage> {
  const url = new URL(`/api/v1/conversations/${conversationId}/messages`, window.location.origin);
  if (cursor) url.searchParams.set("cursor", cursor);
  url.searchParams.set("direction", "before");
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Failed to fetch messages");
  const json = (await res.json()) as { data: MessagesPage };
  return json.data;
}

async function fetchConversation(conversationId: string): Promise<ConversationData> {
  const res = await fetch(`/api/v1/conversations/${conversationId}`);
  if (!res.ok) throw new Error("Failed to fetch conversation");
  const json = (await res.json()) as { data: ConversationData };
  return json.data;
}

interface ChatWindowProps {
  conversationId: string;
}

type InfiniteData = { pages: MessagesPage[]; pageParams: unknown[] };

/** Update a message in the React Query infinite pages cache */
function updateMessageInCache(
  old: InfiniteData | undefined,
  messageId: string,
  updater: (msg: ChatMessage) => ChatMessage,
): InfiniteData | undefined {
  if (!old) return old;
  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      messages: page.messages.map((m) => (m.messageId === messageId ? updater(m) : m)),
    })),
  };
}

export function ChatWindow({ conversationId }: ChatWindowProps) {
  const t = useTranslations("Chat");
  const tDeleteMessage = useTranslations("Chat.deleteMessage");
  const tEditMessage = useTranslations("Chat.editMessage");
  const queryClient = useQueryClient();
  const { chatSocket, isConnected } = useSocketContext();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;
  const { playChime } = useNotificationSound();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [localMessages, setLocalMessages] = useState<LocalChatMessage[]>([]);
  const router = useRouter();

  // Edit / delete / reply state (owned by ChatWindow per story architecture)
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [deleteConfirmMessageId, setDeleteConfirmMessageId] = useState<string | null>(null);

  // Cache parent messages for reply context — ensures parent content is always available
  // even during React Query cache transitions (race condition between socket event and re-render).
  // Uses state (not ref) because the value is read during render and must trigger re-renders.
  const [parentMessageCache, setParentMessageCache] = useState<Map<string, ChatMessage>>(new Map());

  // Fetch conversation details for header
  const [showGroupInfo, setShowGroupInfo] = useState(false);

  const conversationQuery = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => fetchConversation(conversationId),
    staleTime: 60_000,
  });
  const conversationData = conversationQuery.data?.conversation;
  const isGroup = conversationData?.type === "group";
  const otherMember = conversationData?.otherMember;
  const groupMembers = conversationData?.members ?? [];
  const memberCount = conversationData?.memberCount ?? groupMembers.length;

  // Build a memberDisplayNameMap from conversation data
  const memberDisplayNameMap: Record<string, string> = {};
  if (currentUserId) {
    memberDisplayNameMap[currentUserId] = t("group.you").replace("(", "").replace(")", "");
  }
  if (isGroup) {
    for (const m of groupMembers) {
      memberDisplayNameMap[m.id] = m.displayName;
    }
  } else if (otherMember) {
    memberDisplayNameMap[otherMember.id] = otherMember.displayName;
  }

  // Members for @mention autocomplete
  const conversationMembers = isGroup
    ? groupMembers
    : otherMember
      ? [
          {
            id: otherMember.id,
            displayName: otherMember.displayName,
            photoUrl: otherMember.photoUrl,
          },
        ]
      : [];

  // Fetch message history with cursor pagination
  const query = useInfiniteQuery({
    queryKey: ["messages", conversationId],
    queryFn: ({ pageParam }) => fetchMessagesPage(conversationId, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasMore && lastPage.meta.cursor ? lastPage.meta.cursor : undefined,
    staleTime: 30_000,
  });

  // Flatten all pages into chronological order (oldest first), deduplicating across pages
  const serverMessages: ChatMessage[] = [];
  const seenMessageIds = new Set<string>();
  for (const page of query.data?.pages ?? []) {
    for (const msg of page.messages) {
      if (!seenMessageIds.has(msg.messageId)) {
        seenMessageIds.add(msg.messageId);
        serverMessages.push(msg);
      }
    }
  }

  // Merge server messages with local optimistic messages, deduplicating by messageId
  const visibleLocalMessages = localMessages.filter((lm) => !seenMessageIds.has(lm.messageId));
  const allMessages = [...serverMessages, ...visibleLocalMessages];

  // Subscribe to real-time events and update cache
  useEffect(() => {
    if (!chatSocket) return;

    function handleMessageNew(msg: ChatMessage) {
      if (msg.conversationId !== conversationId) return;

      // Cache every incoming message for parent lookups in reply context
      setParentMessageCache((prev) => new Map(prev).set(msg.messageId, msg));

      queryClient.setQueryData(["messages", conversationId], (old: InfiniteData | undefined) => {
        if (!old) return old;
        const lastPage = old.pages[old.pages.length - 1];
        if (!lastPage) return old;

        const alreadyExists = old.pages.some((page) =>
          page.messages.some((m) => m.messageId === msg.messageId),
        );
        if (alreadyExists) return old;

        const newPages = [
          ...old.pages.slice(0, -1),
          {
            ...lastPage,
            messages: [...lastPage.messages, msg],
          },
        ];
        return { ...old, pages: newPages };
      });

      setLocalMessages((prev) => prev.filter((lm) => lm.messageId !== msg.messageId));

      if (msg.senderId !== currentUserId) {
        playChime();
      }
    }

    function handleMessageEdited(payload: {
      messageId: string;
      conversationId: string;
      content: string;
      editedAt: string;
    }) {
      if (payload.conversationId !== conversationId) return;

      queryClient.setQueryData(["messages", conversationId], (old: InfiniteData | undefined) =>
        updateMessageInCache(old, payload.messageId, (m) => ({
          ...m,
          content: payload.content,
          editedAt: payload.editedAt,
        })),
      );
    }

    function handleMessageDeleted(payload: {
      messageId: string;
      conversationId: string;
      timestamp: string;
    }) {
      if (payload.conversationId !== conversationId) return;

      queryClient.setQueryData(["messages", conversationId], (old: InfiniteData | undefined) =>
        updateMessageInCache(old, payload.messageId, (m) => ({
          ...m,
          content: "",
          deletedAt: payload.timestamp,
        })),
      );
    }

    function handleSyncFullRefresh() {
      setLocalMessages([]);
      void queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
    }

    chatSocket.on("message:new", handleMessageNew);
    chatSocket.on("message:edited", handleMessageEdited);
    chatSocket.on("message:deleted", handleMessageDeleted);
    chatSocket.on("sync:full_refresh", handleSyncFullRefresh);
    return () => {
      chatSocket.off("message:new", handleMessageNew);
      chatSocket.off("message:edited", handleMessageEdited);
      chatSocket.off("message:deleted", handleMessageDeleted);
      chatSocket.off("sync:full_refresh", handleSyncFullRefresh);
    };
  }, [chatSocket, conversationId, queryClient, currentUserId, playChime]);

  // Auto-scroll to newest message on open and on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [allMessages.length]);

  // Mark as read on mount
  useEffect(() => {
    // eslint-disable-next-line no-restricted-syntax
    void fetch(`/api/v1/conversations/${conversationId}`, { method: "PATCH" });
  }, [conversationId]);

  const { sendMessage, editMessage, deleteMessage } = useChat(conversationId);

  // Optimistic edit helper — snapshot BEFORE optimistic update
  const optimisticEditMessage = useCallback(
    (messageId: string, newContent: string) => {
      const snapshot = queryClient.getQueryData<InfiniteData>(["messages", conversationId]);
      queryClient.setQueryData(["messages", conversationId], (old: InfiniteData | undefined) =>
        updateMessageInCache(old, messageId, (m) => ({
          ...m,
          content: newContent,
          editedAt: new Date().toISOString(),
        })),
      );
      return snapshot;
    },
    [queryClient, conversationId],
  );

  // Optimistic delete helper — snapshot BEFORE optimistic update
  const optimisticDeleteMessage = useCallback(
    (messageId: string) => {
      const snapshot = queryClient.getQueryData<InfiniteData>(["messages", conversationId]);
      queryClient.setQueryData(["messages", conversationId], (old: InfiniteData | undefined) =>
        updateMessageInCache(old, messageId, (m) => ({
          ...m,
          content: "",
          deletedAt: new Date().toISOString(),
        })),
      );
      return snapshot;
    },
    [queryClient, conversationId],
  );

  const handleSend = useCallback(
    async (
      content: string,
      attachmentFileUploadIds: string[],
      contentType: "text" | "rich_text",
      parentMessageId?: string,
    ) => {
      const tempId = crypto.randomUUID();
      const optimisticMsg: LocalChatMessage = {
        messageId: tempId,
        tempId,
        conversationId,
        senderId: currentUserId ?? "",
        content,
        contentType,
        createdAt: new Date().toISOString(),
        status: "sending",
        attachments: [],
        reactions: [],
        parentMessageId: parentMessageId ?? null,
      };

      setLocalMessages((prev) => [...prev, optimisticMsg]);

      const result = await sendMessage({
        conversationId,
        content,
        contentType,
        attachmentFileUploadIds:
          attachmentFileUploadIds.length > 0 ? attachmentFileUploadIds : undefined,
        parentMessageId,
      });

      if ("error" in result) {
        setLocalMessages((prev) =>
          prev.map((m) => (m.tempId === tempId ? { ...m, status: "error" } : m)),
        );
      } else {
        setLocalMessages((prev) =>
          prev.map((m) =>
            m.tempId === tempId ? { ...m, messageId: result.messageId, status: "sent" } : m,
          ),
        );
      }

      // Clear reply state on successful send
      if (!("error" in result)) {
        setReplyTo(null);
      }
    },
    [conversationId, currentUserId, sendMessage],
  );

  const handleScrollToMessage = useCallback((messageId: string) => {
    const el = document.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("bg-accent/30");
    setTimeout(() => el.classList.remove("bg-accent/30"), 2000);
  }, []);

  // Determine whether to show avatar for consecutive messages from same sender within 5 min
  function shouldShowAvatar(index: number): boolean {
    if (index === 0) return true;
    const prev = allMessages[index - 1];
    const curr = allMessages[index];
    if (!prev || !curr) return true;
    if (prev.senderId !== curr.senderId) return true;
    const prevTime = new Date(prev.createdAt).getTime();
    const currTime = new Date(curr.createdAt).getTime();
    return currTime - prevTime > 5 * 60 * 1000;
  }

  // For group conversations, look up sender's profile from group members
  function getSenderInfo(senderId: string): { name?: string; photoUrl?: string | null } {
    if (!isGroup) return {};
    const member = groupMembers.find((m) => m.id === senderId);
    return { name: member?.displayName, photoUrl: member?.photoUrl };
  }

  // Format group header names (collapsed if > 3)
  function formatGroupHeaderNames(): string {
    const names = groupMembers.slice(0, 3).map((m) => m.displayName);
    const extra = memberCount - names.length;
    if (extra > 0) return `${names.join(", ")}, +${extra}`;
    return names.join(", ");
  }

  if (query.isLoading) return <ChatWindowSkeleton />;

  if (query.isError) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-destructive">{t("errors.fetchFailed")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div
          data-testid="chat-header"
          className="flex items-center gap-3 px-3 py-2 border-b border-border bg-background flex-shrink-0"
        >
          <button
            type="button"
            onClick={() => router.push("/chat")}
            className="flex md:hidden items-center justify-center h-9 w-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label={t("messages.title")}
          >
            <ArrowLeftIcon className="h-5 w-5" aria-hidden="true" />
          </button>

          {isGroup ? (
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center">
              <GroupAvatarStack members={groupMembers} size="md" />
            </div>
          ) : (
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
              {otherMember?.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={otherMember.photoUrl}
                  alt={otherMember.displayName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-sm font-semibold text-muted-foreground">
                  {otherMember?.displayName?.charAt(0).toUpperCase() ?? "?"}
                </span>
              )}
            </div>
          )}

          <div className="flex flex-1 flex-col min-w-0">
            <span className="truncate text-sm font-semibold text-foreground">
              {isGroup ? formatGroupHeaderNames() : (otherMember?.displayName ?? "…")}
            </span>
            {isGroup && memberCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {t("group.participantCount", { count: memberCount })}
              </span>
            )}
            {!isConnected && (
              <span data-testid="reconnecting-indicator" className="text-xs text-muted-foreground">
                {t("status.reconnecting")}
              </span>
            )}
          </div>

          {isGroup && (
            <button
              type="button"
              onClick={() => setShowGroupInfo((v) => !v)}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              aria-label={t("group.participants")}
              aria-expanded={showGroupInfo}
            >
              <InfoIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Load older messages button */}
        {query.hasNextPage && (
          <div className="flex justify-center py-2 border-b border-border">
            <button
              type="button"
              onClick={() => void query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              {query.isFetchingNextPage ? t("messages.sending") : t("messages.loadOlder")}
            </button>
          </div>
        )}

        {/* Message list */}
        <div className="flex flex-1 flex-col overflow-y-auto px-4 py-4">
          {allMessages.map((msg, index) => {
            const isLocal = "tempId" in msg;
            const isOwnMessage = msg.senderId === currentUserId;
            const senderInfo = isGroup ? getSenderInfo(msg.senderId) : {};
            return (
              <MessageBubble
                key={isLocal ? (msg as LocalChatMessage).tempId : msg.messageId}
                message={msg}
                isOwnMessage={isOwnMessage}
                showAvatar={shouldShowAvatar(index)}
                senderName={
                  !isOwnMessage ? (senderInfo.name ?? otherMember?.displayName) : undefined
                }
                senderPhotoUrl={
                  !isOwnMessage ? (senderInfo.photoUrl ?? otherMember?.photoUrl) : undefined
                }
                currentUserId={currentUserId}
                allMessages={allMessages as ChatMessage[]}
                parentMessageCache={parentMessageCache}
                memberDisplayNameMap={memberDisplayNameMap}
                editingMessageId={editingMessageId}
                onReply={(m) => {
                  setParentMessageCache((prev) => new Map(prev).set(m.messageId, m));
                  setReplyTo(m);
                }}
                onEdit={(m) => setEditingMessageId(m.messageId)}
                onEditSave={async (id, content) => {
                  const snapshot = optimisticEditMessage(id, content);
                  const r = await editMessage(id, conversationId, content);
                  if (r.success) {
                    setEditingMessageId(null);
                  } else {
                    // Rollback
                    if (snapshot) {
                      queryClient.setQueryData(["messages", conversationId], snapshot);
                    }
                    toast.error(r.error ?? tEditMessage("editFailed"));
                  }
                }}
                onEditCancel={() => setEditingMessageId(null)}
                onDelete={(id) => setDeleteConfirmMessageId(id)}
                onScrollToMessage={handleScrollToMessage}
              />
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Message input */}
        <div className="flex flex-col">
          <MessageInput
            onSend={handleSend}
            replyTo={replyTo}
            onClearReply={() => setReplyTo(null)}
            members={conversationMembers}
            memberDisplayNameMap={memberDisplayNameMap}
          />
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={deleteConfirmMessageId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmMessageId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tDeleteMessage("confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{tDeleteMessage("confirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirmMessageId(null)}>
              {tDeleteMessage("cancelButton")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const msgId = deleteConfirmMessageId;
                if (!msgId) return;
                setDeleteConfirmMessageId(null);
                const snapshot = optimisticDeleteMessage(msgId);
                const r = await deleteMessage(msgId, conversationId);
                if (!r.success) {
                  if (snapshot) {
                    queryClient.setQueryData(["messages", conversationId], snapshot);
                  }
                  toast.error(r.error ?? tDeleteMessage("deleteFailed"));
                }
              }}
            >
              {tDeleteMessage("confirmButton")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Group info panel */}
      {isGroup && showGroupInfo && (
        <GroupInfoPanel
          conversationId={conversationId}
          members={groupMembers}
          memberCount={memberCount}
          onClose={() => setShowGroupInfo(false)}
          onLeave={() => router.push("/chat")}
        />
      )}
    </div>
  );
}
