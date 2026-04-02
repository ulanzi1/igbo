"use client";

import { useTranslations } from "next-intl";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
import { useState } from "react";
import type { NotificationPreference } from "@/db/queries/chat-conversations";

interface ConversationPreferencesProps {
  conversationId: string;
  otherMemberId?: string; // Only for direct conversations
  otherMemberName?: string;
  isOpen: boolean;
  onClose: () => void;
  onBlockComplete?: () => void; // Called after blocking — parent navigates away
}

const VALID_PREFERENCES: NotificationPreference[] = ["all", "mentions", "muted"];

export function ConversationPreferences({
  conversationId,
  otherMemberId,
  otherMemberName,
  isOpen,
  onClose,
  onBlockComplete,
}: ConversationPreferencesProps) {
  const t = useTranslations("Chat.preferences");
  const queryClient = useQueryClient();
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);

  // Load current notification preference
  const prefQuery = useQuery({
    queryKey: ["conversation-preferences", conversationId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/conversations/${conversationId}/preferences`);
      if (!res.ok) throw new Error("Failed to load preferences");
      const json = (await res.json()) as {
        data: { notificationPreference: NotificationPreference };
      };
      return json.data;
    },
    enabled: isOpen,
  });

  // Load current DnD state
  const dndQuery = useQuery({
    queryKey: ["user-dnd"],
    queryFn: async () => {
      const res = await fetch("/api/v1/user/dnd");
      if (!res.ok) throw new Error("Failed to load DnD state");
      const json = (await res.json()) as { data: { dnd: boolean } };
      return json.data;
    },
    enabled: isOpen,
  });

  // Load block state for direct conversations
  const blockQuery = useQuery({
    queryKey: ["member-block", otherMemberId],
    queryFn: async () => {
      if (!otherMemberId) return { isBlocked: false };
      const res = await fetch(`/api/v1/members/${otherMemberId}/block`);
      if (!res.ok) throw new Error("Failed to load block state");
      const json = (await res.json()) as { data: { isBlocked: boolean } };
      return json.data;
    },
    enabled: isOpen && !!otherMemberId,
  });

  // Load mute state for direct conversations
  const muteQuery = useQuery({
    queryKey: ["member-mute", otherMemberId],
    queryFn: async () => {
      if (!otherMemberId) return { isMuted: false };
      const res = await fetch(`/api/v1/members/${otherMemberId}/mute`);
      if (!res.ok) throw new Error("Failed to load mute state");
      const json = (await res.json()) as { data: { isMuted: boolean } };
      return json.data;
    },
    enabled: isOpen && !!otherMemberId,
  });

  // Mutation: update notification preference
  const prefMutation = useMutation({
    mutationFn: async (preference: NotificationPreference) => {
      const res = await fetch(`/api/v1/conversations/${conversationId}/preferences`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationPreference: preference }),
      });
      if (!res.ok) throw new Error("Failed to update preference");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["conversation-preferences", conversationId],
      });
    },
  });

  // Mutation: toggle DnD
  const dndMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await fetch("/api/v1/user/dnd", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error("Failed to update DnD");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["user-dnd"] });
    },
  });

  // Mutation: toggle mute
  const muteMutation = useMutation({
    mutationFn: async ({ muted }: { muted: boolean }) => {
      if (!otherMemberId) return;
      const res = await fetch(`/api/v1/members/${otherMemberId}/mute`, {
        method: muted ? "POST" : "DELETE",
      });
      if (!res.ok) throw new Error("Failed to update mute");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["member-mute", otherMemberId] });
    },
  });

  // Mutation: block member
  const blockMutation = useMutation({
    mutationFn: async () => {
      if (!otherMemberId) return;
      const res = await fetch(`/api/v1/members/${otherMemberId}/block`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to block member");
    },
    onSuccess: () => {
      setBlockDialogOpen(false);
      onClose();
      onBlockComplete?.();
    },
  });

  // Mutation: unblock member
  const unblockMutation = useMutation({
    mutationFn: async () => {
      if (!otherMemberId) return;
      const res = await fetch(`/api/v1/members/${otherMemberId}/block`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to unblock member");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["member-block", otherMemberId] });
    },
  });

  const currentPref = prefQuery.data?.notificationPreference ?? "all";
  const isDnd = dndQuery.data?.dnd ?? false;
  const isMuted = muteQuery.data?.isMuted ?? false;
  const isBlocked = blockQuery.data?.isBlocked ?? false;
  const memberName = otherMemberName ?? "member";

  return (
    <>
      <Sheet
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <SheetContent side="right" className="w-80 sm:w-96 overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t("title")}</SheetTitle>
          </SheetHeader>

          <div className="mt-6 space-y-6 px-2">
            {/* Notification preference */}
            <section>
              <h3 className="mb-3 text-sm font-semibold text-foreground">
                {t("notificationPreference")}
              </h3>
              <div className="space-y-2" role="radiogroup" aria-label={t("notificationPreference")}>
                {VALID_PREFERENCES.map((pref) => (
                  <label
                    key={pref}
                    className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-accent"
                  >
                    <input
                      type="radio"
                      name="notification-preference"
                      value={pref}
                      checked={currentPref === pref}
                      onChange={() => prefMutation.mutate(pref)}
                      className="h-4 w-4"
                    />
                    <span className="text-sm">{t(pref as "all" | "mentions" | "muted")}</span>
                  </label>
                ))}
              </div>
            </section>

            {/* Do Not Disturb toggle */}
            <section>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{t("doNotDisturb")}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t("dndDescription")}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isDnd}
                  onClick={() => dndMutation.mutate(!isDnd)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    isDnd ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                      isDnd ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </section>

            {/* Direct conversation actions */}
            {otherMemberId && (
              <section className="space-y-2 border-t border-border pt-4">
                {/* Mute toggle */}
                <button
                  type="button"
                  onClick={() => muteMutation.mutate({ muted: !isMuted })}
                  className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                >
                  {isMuted
                    ? t("unmuteMember", { name: memberName })
                    : t("muteMember", { name: memberName })}
                </button>

                {/* Block / Unblock button */}
                {isBlocked ? (
                  <button
                    type="button"
                    onClick={() => unblockMutation.mutate()}
                    className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                  >
                    {t("unblockMember", { name: memberName })}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setBlockDialogOpen(true)}
                    className="w-full rounded-md px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    {t("blockMember", { name: memberName })}
                  </button>
                )}
              </section>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Block confirmation dialog */}
      <AlertDialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("blockConfirmTitle", { name: memberName })}</AlertDialogTitle>
            <AlertDialogDescription>{t("blockConfirmBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("close")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => blockMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("blockConfirmButton")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
