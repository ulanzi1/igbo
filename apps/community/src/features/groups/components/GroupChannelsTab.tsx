"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import type { GroupChannelItem } from "@/db/queries/group-channels";

const ChatWindow = dynamic(() => import("@/features/chat").then((m) => m.ChatWindow), {
  ssr: false,
});

interface GroupChannelsTabProps {
  groupId: string;
  viewerRole: "member" | "leader" | "creator" | null;
}

export function GroupChannelsTab({ groupId, viewerRole }: GroupChannelsTabProps) {
  const t = useTranslations("Groups");
  const queryClient = useQueryClient();
  const isLeaderOrCreator = viewerRole === "leader" || viewerRole === "creator";
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelDesc, setNewChannelDesc] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const { data: channels = [] } = useQuery<GroupChannelItem[]>({
    queryKey: ["group-channels", groupId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/groups/${groupId}/channels`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch channels");
      const json = (await res.json()) as { data: { channels: GroupChannelItem[] } };
      return json.data.channels;
    },
  });

  const activeChannel = channels.find((c) => c.id === activeChannelId) ?? channels[0] ?? null;

  const createMutation = useMutation({
    mutationFn: async ({ name, description }: { name: string; description?: string }) => {
      const res = await fetch(`/api/v1/groups/${groupId}/channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, description }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { detail?: string };
        throw new Error(err.detail ?? "Failed to create channel");
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["group-channels", groupId] });
      setShowCreateDialog(false);
      setNewChannelName("");
      setNewChannelDesc("");
      setCreateError(null);
    },
    onError: (err: Error) => {
      setCreateError(err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (channelId: string) => {
      const res = await fetch(`/api/v1/groups/${groupId}/channels/${channelId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = (await res.json()) as { detail?: string };
        throw new Error(err.detail ?? "Failed to delete channel");
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["group-channels", groupId] });
      setActiveChannelId(null);
    },
  });

  return (
    <div className="flex gap-4 min-h-[400px]">
      {/* Left sidebar: channel list */}
      <div className="w-48 shrink-0 flex flex-col gap-1">
        {channels.map((channel) => (
          <div key={channel.id} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveChannelId(channel.id)}
              className={`flex-1 text-left rounded px-2 py-1.5 text-sm truncate min-h-[36px] transition-colors ${
                (activeChannel?.id ?? null) === channel.id
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent text-foreground"
              }`}
            >
              # {channel.name}
            </button>
            {isLeaderOrCreator && !channel.isDefault && (
              <button
                type="button"
                onClick={() => {
                  if (confirm(t("channel.confirmDelete"))) {
                    deleteMutation.mutate(channel.id);
                  }
                }}
                aria-label={t("channel.delete")}
                className="shrink-0 rounded px-1 py-1 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 min-h-[36px] transition-colors"
              >
                ×
              </button>
            )}
          </div>
        ))}

        {isLeaderOrCreator && (
          <button
            type="button"
            onClick={() => setShowCreateDialog(true)}
            className="mt-2 rounded px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors min-h-[36px] text-left"
          >
            + {t("channel.create")}
          </button>
        )}
      </div>

      {/* Right panel: chat window */}
      <div className="flex-1 min-w-0">
        {activeChannel ? (
          <ChatWindow
            conversationId={activeChannel.conversationId}
            channelName={activeChannel.name}
            groupId={groupId}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {t("channel.selectPrompt")}
          </div>
        )}
      </div>

      {/* Create channel dialog */}
      {showCreateDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowCreateDialog(false)}
        >
          <div
            className="bg-card rounded-lg border border-border p-6 w-full max-w-sm space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-sm">{t("channel.create")}</h3>
            <input
              type="text"
              placeholder={t("channel.namePlaceholder")}
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[36px]"
              maxLength={100}
            />
            <input
              type="text"
              placeholder={t("channel.descriptionPlaceholder")}
              value={newChannelDesc}
              onChange={(e) => setNewChannelDesc(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[36px]"
              maxLength={500}
            />
            {createError && (
              <p className="text-xs text-destructive" role="alert">
                {createError}
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowCreateDialog(false)}
                className="rounded px-3 py-1.5 text-sm border border-border hover:bg-accent transition-colors min-h-[36px]"
              >
                {t("channel.cancelCreate")}
              </button>
              <button
                type="button"
                disabled={!newChannelName.trim() || createMutation.isPending}
                onClick={() =>
                  createMutation.mutate({
                    name: newChannelName.trim(),
                    description: newChannelDesc.trim() || undefined,
                  })
                }
                className="rounded px-3 py-1.5 text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 min-h-[36px]"
              >
                {createMutation.isPending ? t("channel.creating") : t("channel.createButton")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
