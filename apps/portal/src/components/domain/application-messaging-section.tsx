"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MessagingDrawer } from "@/components/messaging/MessagingDrawer";

export interface ApplicationMessagingSectionProps {
  applicationId: string;
  conversationExists: boolean;
  readOnly: boolean;
  otherPartyName: string;
  unreadCount: number;
}

export function ApplicationMessagingSection({
  applicationId,
  conversationExists,
  readOnly: _readOnly,
  otherPartyName,
  unreadCount,
}: ApplicationMessagingSectionProps) {
  const t = useTranslations("Portal.messages");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [localUnreadCount, setLocalUnreadCount] = useState(unreadCount);

  // Refresh unread count on mount (SSR prop may be stale) (P9).
  useEffect(() => {
    if (!conversationExists) return;
    fetch(`/api/v1/conversations/${applicationId}/status`)
      .then((r) => {
        if (!r.ok) return null;
        return r.json() as Promise<{ data: { unreadCount: number } }>;
      })
      .then((body) => {
        if (body && typeof body.data.unreadCount === "number") {
          setLocalUnreadCount(body.data.unreadCount);
        }
      })
      .catch(() => {});
  }, [applicationId, conversationExists]);

  if (!conversationExists) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="no-conversation-note">
        {t("noConversationYet")}
      </p>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        className="relative"
        onClick={() => {
          setLocalUnreadCount(0);
          setDrawerOpen(true);
        }}
        aria-label={
          localUnreadCount > 0
            ? t("unreadBadgeLabel", { count: String(localUnreadCount) })
            : t("messageEmployer")
        }
        data-testid="message-employer-button"
      >
        <MessageSquare className="mr-2 size-4" aria-hidden="true" />
        {t("messageEmployer")}
        {localUnreadCount > 0 && (
          <span
            className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-destructive text-xs font-bold text-destructive-foreground"
            aria-hidden="true"
          >
            {localUnreadCount > 99 ? "99+" : localUnreadCount}
          </span>
        )}
      </Button>

      <MessagingDrawer
        applicationId={applicationId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        otherParticipantName={otherPartyName}
      />
    </>
  );
}
