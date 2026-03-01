"use client";

import { useState, useEffect, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { repostAction, shareToConversationAction } from "../actions/share-post";

interface ShareDialogProps {
  postId: string;
  postAuthorName: string;
  isOpen: boolean;
  onClose: () => void;
  onShareComplete: () => void; // Increments local shareCount in parent
  sort: string;
  filter: string;
}

type ShareTab = "repost" | "conversation" | "group";

export function ShareDialog({
  postId,
  postAuthorName,
  isOpen,
  onClose,
  onShareComplete,
  sort,
  filter,
}: ShareDialogProps) {
  const t = useTranslations("Feed");
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ShareTab>("repost");
  const [commentText, setCommentText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleRepost = () => {
    setError(null);
    startTransition(async () => {
      const result = await repostAction({ originalPostId: postId, commentText });
      if (!result.success) {
        setError(t("share.errorGeneric"));
        return;
      }
      setSuccess(t("share.repostSuccess"));
      onShareComplete();
      await queryClient.invalidateQueries({ queryKey: ["feed", sort, filter] });
      setTimeout(() => onClose(), 1500);
    });
  };

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/feed?post=${postId}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      setError(t("share.errorGeneric"));
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("share.share")}</DialogTitle>
        </DialogHeader>

        {/* Tab navigation */}
        <div className="flex gap-2 border-b border-border pb-2">
          {(["repost", "conversation", "group"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              disabled={tab === "group"}
              aria-pressed={activeTab === tab}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                activeTab === tab
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
              }`}
            >
              {tab === "repost"
                ? t("share.repost")
                : tab === "conversation"
                  ? t("share.shareToConversation")
                  : t("share.shareToGroup")}
              {tab === "group" && (
                <span className="ml-1 text-xs opacity-60">
                  ({t("share.shareToGroupComingSoon").split("—")[0]?.trim()})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Repost tab */}
        {activeTab === "repost" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {t("share.originalPostBy", { name: postAuthorName })}
            </p>
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={t("share.repostWithComment")}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              maxLength={2000}
            />
            {error && (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            )}
            {success && (
              <p className="text-xs text-green-600" role="status">
                {success}
              </p>
            )}
            <Button type="button" className="w-full" disabled={isPending} onClick={handleRepost}>
              {isPending ? t("composer.submitting") : t("share.repostSubmit")}
            </Button>
          </div>
        )}

        {/* Share to conversation tab */}
        {activeTab === "conversation" && (
          <ConversationPicker
            postId={postId}
            onShareComplete={() => {
              onShareComplete();
              onClose();
            }}
          />
        )}

        {/* Copy link (always available) */}
        <div className="border-t border-border pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => void handleCopyLink()}
          >
            {linkCopied ? t("share.linkCopied") : t("share.copyLink")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Inline sub-component: shows existing conversations to pick for sharing
function ConversationPicker({
  postId,
  onShareComplete,
}: {
  postId: string;
  onShareComplete: () => void;
}) {
  const t = useTranslations("Feed");
  const [conversations, setConversations] = useState<Array<{ id: string; displayName: string }>>(
    [],
  );
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const fetchConversations = async () => {
    if (hasFetched) return;
    setIsLoading(true);
    setHasFetched(true);
    try {
      const res = await fetch("/api/v1/conversations?limit=20");
      if (res.ok) {
        // Actual response shape from GET /api/v1/conversations (chat-conversations.ts):
        // Direct convos: { id, type, otherMember: { id, displayName, photoUrl }, ... }
        // Group convos: { id, type, groupName, members: [...], ... }
        const json = (await res.json()) as {
          data: {
            conversations: Array<{
              id: string;
              type: "direct" | "group" | "channel";
              otherMember: { id: string; displayName: string; photoUrl: string | null };
              groupName?: string | null;
            }>;
          };
        };
        setConversations(
          json.data.conversations.map((c) => ({
            id: c.id,
            displayName: c.type === "group" ? (c.groupName ?? "Group") : c.otherMember.displayName,
          })),
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch on mount
  useEffect(() => {
    void fetchConversations();
  }, []);

  const handleShare = (conversationId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await shareToConversationAction({ postId, conversationId });
      if (!result.success) {
        setError(t("share.errorGeneric"));
        return;
      }
      onShareComplete();
    });
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">{t("loading")}</p>;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{t("share.shareToConversationHint")}</p>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <ul className="max-h-48 overflow-y-auto space-y-1">
        {conversations.map((conv) => (
          <li key={conv.id}>
            <button
              type="button"
              onClick={() => handleShare(conv.id)}
              disabled={isPending}
              className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors"
            >
              {conv.displayName}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
