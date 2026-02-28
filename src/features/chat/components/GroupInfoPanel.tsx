"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { XIcon, PlusIcon, LogOutIcon } from "lucide-react";
import { useMemberSearch } from "@/features/chat/hooks/use-member-search";
import { useSession } from "next-auth/react";

interface GroupMember {
  id: string;
  displayName: string;
  photoUrl: string | null;
}

interface GroupInfoPanelProps {
  conversationId: string;
  members: GroupMember[];
  memberCount: number;
  onClose: () => void;
  onLeave: () => void;
  isOnline?: (userId: string) => boolean;
}

/**
 * Slide-out panel showing full participant list for a group DM.
 * Allows adding new members and leaving the conversation.
 * Online status is placeholder — full presence integration in Story 2.6.
 */
export function GroupInfoPanel({
  conversationId,
  members,
  memberCount,
  onClose,
  onLeave,
  isOnline,
}: GroupInfoPanelProps) {
  const t = useTranslations("Chat");
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? "";

  const [showAddMember, setShowAddMember] = useState(false);
  const [addSearchQuery, setAddSearchQuery] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  const excludeUserIds = [currentUserId, ...members.map((m) => m.id)].filter(Boolean);
  const { results, isSearching } = useMemberSearch(addSearchQuery, excludeUserIds);

  const handleAddMember = useCallback(
    async (newUserId: string) => {
      setIsAdding(true);
      setAddError(null);
      try {
        const res = await fetch(
          `${window.location.origin}/api/v1/conversations/${conversationId}/members`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: newUserId }),
          },
        );
        if (!res.ok) {
          const body = (await res.json()) as { detail?: string };
          setAddError(body.detail ?? t("errors.createFailed"));
        } else {
          setShowAddMember(false);
          setAddSearchQuery("");
          // Parent will re-fetch members on next render via query invalidation
        }
      } catch {
        setAddError(t("errors.createFailed"));
      } finally {
        setIsAdding(false);
      }
    },
    [conversationId, t],
  );

  const handleLeave = useCallback(async () => {
    setIsLeaving(true);
    try {
      const res = await fetch(
        `${window.location.origin}/api/v1/conversations/${conversationId}/members`,
        { method: "DELETE" },
      );
      if (res.ok) {
        onLeave();
      }
    } catch {
      // Swallow — user can try again
    } finally {
      setIsLeaving(false);
      setShowLeaveConfirm(false);
    }
  }, [conversationId, onLeave]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("group.participants")}
      className="flex h-full w-72 flex-col border-l border-border bg-background"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">{t("group.participants")}</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:text-foreground"
          aria-label={t("group.cancel")}
        >
          <XIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Member count */}
      <p className="px-4 py-2 text-xs text-muted-foreground">
        {t("group.participantCount", { count: memberCount })}
      </p>

      {/* Member list */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {members.map((member) => (
          <div key={member.id} className="flex items-center gap-2 rounded-md px-2 py-2">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
              {member.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={member.photoUrl}
                  alt={member.displayName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-xs font-semibold text-muted-foreground">
                  {member.displayName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <span className="flex-1 truncate text-sm">
              {member.displayName}
              {member.id === currentUserId && (
                <span className="ml-1 text-xs text-muted-foreground">{t("group.you")}</span>
              )}
            </span>
            {isOnline?.(member.id) ? (
              <span
                className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-green-500"
                aria-label={t("conversations.online")}
                role="img"
              />
            ) : (
              <span
                className="h-2 w-2 flex-shrink-0 rounded-full bg-muted-foreground/30"
                aria-hidden="true"
              />
            )}
          </div>
        ))}
      </div>

      {/* Add Member section */}
      <div className="border-t border-border px-4 py-3">
        {!showAddMember ? (
          <button
            type="button"
            onClick={() => setShowAddMember(true)}
            className="flex w-full items-center gap-2 rounded-md py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <PlusIcon className="h-4 w-4" aria-hidden="true" />
            {t("group.addMember")}
          </button>
        ) : (
          <div>
            <input
              type="text"
              value={addSearchQuery}
              onChange={(e) => setAddSearchQuery(e.target.value)}
              placeholder={t("group.searchMembers")}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              aria-label={t("group.searchMembers")}
              autoFocus
            />
            {addSearchQuery.trim().length >= 2 && (
              <div className="mt-1 max-h-32 overflow-y-auto rounded-md border border-border bg-background shadow-sm">
                {isSearching && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    {t("conversations.loading")}
                  </p>
                )}
                {!isSearching && results.length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">{t("empty.subtitle")}</p>
                )}
                {results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    disabled={isAdding}
                    onClick={() => void handleAddMember(r.id)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50"
                  >
                    <span className="flex-1 truncate">{r.displayName}</span>
                  </button>
                ))}
              </div>
            )}
            {addError && (
              <p className="mt-1 text-xs text-destructive" role="alert">
                {addError}
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                setShowAddMember(false);
                setAddSearchQuery("");
                setAddError(null);
              }}
              className="mt-2 text-xs text-muted-foreground hover:text-foreground"
            >
              {t("group.cancel")}
            </button>
          </div>
        )}
      </div>

      {/* Leave conversation */}
      <div className="border-t border-border px-4 py-3">
        {!showLeaveConfirm ? (
          <button
            type="button"
            onClick={() => setShowLeaveConfirm(true)}
            className="flex w-full items-center gap-2 rounded-md py-2 text-sm text-destructive hover:text-destructive/80 transition-colors"
          >
            <LogOutIcon className="h-4 w-4" aria-hidden="true" />
            {t("group.leaveGroup")}
          </button>
        ) : (
          <div>
            <p className="mb-2 text-xs text-muted-foreground">{t("group.leaveConfirm")}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleLeave()}
                disabled={isLeaving}
                className="flex-1 rounded-md bg-destructive py-1.5 text-xs font-medium text-destructive-foreground disabled:opacity-50"
              >
                {isLeaving ? t("messages.sending") : t("group.leave")}
              </button>
              <button
                type="button"
                onClick={() => setShowLeaveConfirm(false)}
                className="flex-1 rounded-md border border-border py-1.5 text-xs"
              >
                {t("group.cancel")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
