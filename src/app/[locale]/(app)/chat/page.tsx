"use client";

import { MessageCircleIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { ConversationList } from "@/features/chat/components/ConversationList";

export default function ChatPage() {
  const t = useTranslations("Chat");

  return (
    <>
      {/* Mobile only: show conversation list (md+ layout sidebar handles it) */}
      <div className="flex md:hidden flex-1 flex-col">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <h1 className="text-lg font-semibold">{t("conversations.title")}</h1>
        </div>
        <ConversationList />
      </div>

      {/* Tablet+: placeholder pane — select a conversation */}
      <div
        data-testid="select-conversation-prompt"
        className="hidden md:flex flex-1 flex-col items-center justify-center gap-3 text-center p-8"
      >
        <MessageCircleIcon className="h-12 w-12 text-muted-foreground/40" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{t("conversations.lastMessageFallback")}</p>
      </div>
    </>
  );
}
