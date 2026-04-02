"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type {
  GroupVisibility,
  GroupJoinType,
  GroupPostingPermission,
  GroupCommentingPermission,
} from "@igbo/db/schema/community-groups";

interface SerializedGroup {
  id: string;
  name: string;
  description: string | null;
  bannerUrl: string | null;
  visibility: GroupVisibility;
  joinType: GroupJoinType;
  postingPermission: GroupPostingPermission;
  commentingPermission: GroupCommentingPermission;
  memberLimit: number | null;
  creatorId: string;
  memberCount: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PendingRequest {
  userId: string;
  displayName: string | null;
  joinedAt: string;
}

interface GroupSettingsProps {
  group: SerializedGroup;
  viewerIsCreatorOrLeader: boolean;
}

export function GroupSettings({ group, viewerIsCreatorOrLeader }: GroupSettingsProps) {
  const t = useTranslations("Groups");

  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? "");
  const [visibility, setVisibility] = useState<GroupVisibility>(group.visibility);
  const [joinType, setJoinType] = useState<GroupJoinType>(group.joinType);
  const [postingPermission, setPostingPermission] = useState<GroupPostingPermission>(
    group.postingPermission,
  );
  const [commentingPermission, setCommentingPermission] = useState<GroupCommentingPermission>(
    group.commentingPermission,
  );
  const [memberLimit, setMemberLimit] = useState<string>(group.memberLimit?.toString() ?? "");

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!viewerIsCreatorOrLeader) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setIsSaving(true);

    try {
      const res = await fetch(`/api/v1/groups/${group.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || null,
          visibility,
          joinType,
          postingPermission,
          commentingPermission,
          memberLimit: memberLimit ? parseInt(memberLimit, 10) : null,
        }),
      });

      if (!res.ok) {
        const data: unknown = await res.json();
        const detail =
          data !== null && typeof data === "object" && "detail" in data
            ? String((data as { detail: unknown }).detail)
            : t("errors.permissionDenied");
        setError(detail);
      } else {
        setSuccess(true);
      }
    } catch {
      setError(t("errors.permissionDenied"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Pending Join Requests — shown above settings form for approval-based groups */}
      {group.joinType === "approval" && <PendingRequestsSection groupId={group.id} />}

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        <h2 className="text-lg font-semibold">{t("settingsTitle")}</h2>

        {error && (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {success && (
          <p role="status" className="rounded-md bg-green-50 px-4 py-2 text-sm text-green-700">
            {t("settingsSaved")}
          </p>
        )}

        {/* Name */}
        <div className="space-y-1">
          <label htmlFor="settings-name" className="text-sm font-medium">
            {t("form.name")}
          </label>
          <input
            id="settings-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            required
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        {/* Description */}
        <div className="space-y-1">
          <label htmlFor="settings-description" className="text-sm font-medium">
            {t("form.description")}
          </label>
          <textarea
            id="settings-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        {/* Visibility */}
        <div className="space-y-1">
          <label htmlFor="settings-visibility" className="text-sm font-medium">
            {t("form.visibility")}
          </label>
          <select
            id="settings-visibility"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as GroupVisibility)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="public">{t("visibilityOptions.public")}</option>
            <option value="private">{t("visibilityOptions.private")}</option>
            <option value="hidden">{t("visibilityOptions.hidden")}</option>
          </select>
        </div>

        {/* Join Type */}
        <div className="space-y-1">
          <label htmlFor="settings-join-type" className="text-sm font-medium">
            {t("form.joinType")}
          </label>
          <select
            id="settings-join-type"
            value={joinType}
            onChange={(e) => setJoinType(e.target.value as GroupJoinType)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="open">{t("joinTypeOptions.open")}</option>
            <option value="approval">{t("joinTypeOptions.approval")}</option>
          </select>
        </div>

        {/* Posting Permission */}
        <div className="space-y-1">
          <label htmlFor="settings-posting" className="text-sm font-medium">
            {t("form.postingPermission")}
          </label>
          <select
            id="settings-posting"
            value={postingPermission}
            onChange={(e) => setPostingPermission(e.target.value as GroupPostingPermission)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="all_members">{t("postingPermOptions.allMembers")}</option>
            <option value="leaders_only">{t("postingPermOptions.leadersOnly")}</option>
            <option value="moderated">{t("postingPermOptions.moderated")}</option>
          </select>
        </div>

        {/* Commenting Permission */}
        <div className="space-y-1">
          <label htmlFor="settings-commenting" className="text-sm font-medium">
            {t("form.commentingPermission")}
          </label>
          <select
            id="settings-commenting"
            value={commentingPermission}
            onChange={(e) => setCommentingPermission(e.target.value as GroupCommentingPermission)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="open">{t("commentingPermOptions.open")}</option>
            <option value="members_only">{t("commentingPermOptions.membersOnly")}</option>
            <option value="disabled">{t("commentingPermOptions.disabled")}</option>
          </select>
        </div>

        {/* Member Limit */}
        <div className="space-y-1">
          <label htmlFor="settings-member-limit" className="text-sm font-medium">
            {t("form.memberLimit")}
          </label>
          <input
            id="settings-member-limit"
            type="number"
            value={memberLimit}
            onChange={(e) => setMemberLimit(e.target.value)}
            min={1}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <button
          type="submit"
          disabled={isSaving || !name.trim()}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isSaving ? "..." : t("settingsSaveButton")}
        </button>
      </form>
    </div>
  );
}

function PendingRequestsSection({ groupId }: { groupId: string }) {
  const t = useTranslations("Groups");
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/groups/${groupId}`, { credentials: "include" });
      if (res.ok) {
        const json: unknown = await res.json();
        const data = json as { data: { pendingRequests?: PendingRequest[] } };
        setRequests(data.data.pendingRequests ?? []);
      }
    } catch {
      // Silently fail — non-critical
    } finally {
      setIsLoadingRequests(false);
    }
  }, [groupId]);

  useEffect(() => {
    void fetchRequests();
  }, [fetchRequests]);

  const handleApprove = async (userId: string) => {
    setActionInProgress(userId);
    try {
      const res = await fetch(`/api/v1/groups/${groupId}/requests/${userId}/approve`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        setRequests((prev) => prev.filter((r) => r.userId !== userId));
      }
    } catch {
      // Handle silently
    } finally {
      setActionInProgress(null);
    }
  };

  const handleReject = async (userId: string) => {
    setActionInProgress(userId);
    try {
      const res = await fetch(`/api/v1/groups/${groupId}/requests/${userId}/reject`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        setRequests((prev) => prev.filter((r) => r.userId !== userId));
      }
    } catch {
      // Handle silently
    } finally {
      setActionInProgress(null);
    }
  };

  return (
    <div className="border-t pt-6" data-testid="pending-requests-section">
      <h3 className="text-md mb-3 font-semibold">{t("pendingRequests")}</h3>

      {isLoadingRequests && <p className="text-sm text-muted-foreground">...</p>}

      {!isLoadingRequests && requests.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("noRequests")}</p>
      )}

      {!isLoadingRequests && requests.length > 0 && (
        <ul className="space-y-2">
          {requests.map((req) => (
            <li
              key={req.userId}
              className="flex items-center justify-between rounded-md border px-3 py-2"
              data-testid="pending-request-item"
            >
              <Link
                href={`/profiles/${req.userId}`}
                className="text-sm font-medium text-primary hover:underline"
              >
                {req.displayName ?? req.userId}
              </Link>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleApprove(req.userId)}
                  disabled={actionInProgress === req.userId}
                  className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {t("approveRequest")}
                </button>
                <button
                  type="button"
                  onClick={() => handleReject(req.userId)}
                  disabled={actionInProgress === req.userId}
                  className="rounded-md bg-destructive px-3 py-1 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                >
                  {t("rejectRequest")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
