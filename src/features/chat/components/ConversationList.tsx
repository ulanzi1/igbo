"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { UsersIcon } from "lucide-react";
import { useConversations } from "@/features/chat/hooks/use-conversations";
import { ConversationItem } from "./ConversationItem";
import { ConversationListSkeleton } from "./ConversationListSkeleton";
import { ChatEmptyState } from "./ChatEmptyState";
import { NewGroupDialog } from "./NewGroupDialog";

export function ConversationList() {
  const t = useTranslations("Chat");
  const params = useParams<{ conversationId?: string }>();
  const activeConversationId = params?.conversationId;
  const [showNewGroupDialog, setShowNewGroupDialog] = useState(false);

  const { conversations, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useConversations();

  if (isLoading) return <ConversationListSkeleton />;

  if (isError) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <p className="text-sm text-destructive">{t("errors.fetchFailed")}</p>
      </div>
    );
  }

  return (
    <>
      {/* New Group button header */}
      <div className="flex items-center justify-end border-b border-border px-3 py-2">
        <button
          type="button"
          onClick={() => setShowNewGroupDialog(true)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          aria-label={t("group.newGroup")}
        >
          <UsersIcon className="h-4 w-4" aria-hidden="true" />
          {t("group.newGroup")}
        </button>
      </div>

      {showNewGroupDialog && <NewGroupDialog onClose={() => setShowNewGroupDialog(false)} />}

      {conversations.length === 0 && <ChatEmptyState />}

      <div className="flex flex-1 flex-col overflow-y-auto">
        {conversations.map((conversation) => (
          <ConversationItem
            key={conversation.id}
            conversation={conversation}
            isActive={conversation.id === activeConversationId}
          />
        ))}

        {hasNextPage && (
          <button
            type="button"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
            className="w-full py-3 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {isFetchingNextPage ? t("messages.sending") : t("conversations.loadMore")}
          </button>
        )}
      </div>
    </>
  );
}
