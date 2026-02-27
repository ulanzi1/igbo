"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { XIcon, SearchIcon, PlusIcon } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { useMemberSearch } from "@/features/chat/hooks/use-member-search";
import { createGroupConversation } from "@/features/chat/actions/create-group-conversation";
import { useSession } from "next-auth/react";

interface MemberChip {
  id: string;
  displayName: string;
  photoUrl: string | null;
}

interface NewGroupDialogProps {
  onClose: () => void;
}

export function NewGroupDialog({ onClose }: NewGroupDialogProps) {
  const t = useTranslations("Chat");
  const router = useRouter();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? "";

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<MemberChip[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Exclude self + already selected from search results
  const excludeUserIds = [currentUserId, ...selectedMembers.map((m) => m.id)].filter(Boolean);
  const { results, isSearching } = useMemberSearch(searchQuery, excludeUserIds);

  const handleSelectMember = useCallback((member: MemberChip) => {
    setSelectedMembers((prev) => [...prev, member]);
    setSearchQuery("");
  }, []);

  const handleRemoveMember = useCallback((memberId: string) => {
    setSelectedMembers((prev) => prev.filter((m) => m.id !== memberId));
  }, []);

  const handleCreate = useCallback(async () => {
    if (selectedMembers.length < 2) return;
    setIsCreating(true);
    setCreateError(null);

    const result = await createGroupConversation(selectedMembers.map((m) => m.id));
    setIsCreating(false);

    if ("error" in result) {
      setCreateError(result.error);
    } else {
      onClose();
      router.push(`/chat/${result.conversationId}`);
    }
  }, [selectedMembers, onClose, router]);

  const canCreate = selectedMembers.length >= 2 && !isCreating;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("group.newGroup")}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md rounded-lg bg-background p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("group.newGroup")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
            aria-label={t("group.cancel")}
          >
            <XIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Search input */}
        <div className="relative mb-3">
          <SearchIcon
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("group.searchMembers")}
            className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label={t("group.searchMembers")}
          />
        </div>

        {/* Search results */}
        {searchQuery.trim().length >= 2 && (
          <div
            role="listbox"
            aria-label={t("group.addMembers")}
            className="mb-3 max-h-40 overflow-y-auto rounded-md border border-border"
          >
            {isSearching && (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                {t("conversations.loading")}
              </p>
            )}
            {!isSearching && results.length === 0 && (
              <p className="px-3 py-2 text-sm text-muted-foreground">{t("empty.subtitle")}</p>
            )}
            {results.map((member) => (
              <button
                key={member.id}
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => handleSelectMember(member)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
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
                <span className="truncate">{member.displayName}</span>
                <PlusIcon
                  className="ml-auto h-4 w-4 flex-shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        )}

        {/* Selected member chips */}
        {selectedMembers.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2" aria-label={t("group.addMembers")}>
            {selectedMembers.map((member) => (
              <span
                key={member.id}
                className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary"
              >
                {member.displayName}
                <button
                  type="button"
                  onClick={() => handleRemoveMember(member.id)}
                  className="ml-1 rounded-full hover:text-destructive"
                  aria-label={t("group.removeMember", { name: member.displayName })}
                >
                  <XIcon className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Minimum members hint */}
        {selectedMembers.length < 2 && (
          <p className="mb-4 text-xs text-muted-foreground" role="status">
            {t("group.minMembers")}
          </p>
        )}

        {/* Create error */}
        {createError && (
          <p className="mb-4 text-sm text-destructive" role="alert">
            {createError}
          </p>
        )}

        {/* Create button */}
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={!canCreate}
          className="w-full rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 hover:bg-primary/90 transition-colors"
        >
          {isCreating ? t("messages.sending") : t("group.createGroup")}
        </button>
      </div>
    </div>
  );
}
