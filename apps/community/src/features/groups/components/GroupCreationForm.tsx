"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { FileUpload } from "@/components/shared/FileUpload";
import { createGroupAction } from "@/features/groups/actions/create-group";
import type {
  GroupVisibility,
  GroupJoinType,
  GroupPostingPermission,
  GroupCommentingPermission,
} from "@igbo/db/schema/community-groups";

interface GroupCreationFormProps {
  canCreate: boolean;
}

export function GroupCreationForm({ canCreate }: GroupCreationFormProps) {
  const t = useTranslations("Groups");
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [bannerUrl, setBannerUrl] = useState<string | undefined>(undefined);
  const [visibility, setVisibility] = useState<GroupVisibility>("public");
  const [joinType, setJoinType] = useState<GroupJoinType>("open");
  const [postingPermission, setPostingPermission] = useState<GroupPostingPermission>("all_members");
  const [commentingPermission, setCommentingPermission] =
    useState<GroupCommentingPermission>("open");
  const [memberLimit, setMemberLimit] = useState<string>("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canCreate) {
    return (
      <div className="rounded-lg border border-border bg-muted/50 p-6 text-center">
        <p className="text-muted-foreground">{t("upgradePrompt")}</p>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = await createGroupAction({
      name,
      description: description || undefined,
      bannerUrl,
      visibility,
      joinType,
      postingPermission,
      commentingPermission,
      memberLimit: memberLimit ? parseInt(memberLimit, 10) : undefined,
    });

    setIsSubmitting(false);

    if ("errorCode" in result) {
      setError(result.reason);
      return;
    }

    router.push(`/groups/${result.groupId}`);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Banner image */}
      <div className="space-y-1">
        <label className="text-sm font-medium">{t("form.bannerImage")}</label>
        {bannerUrl ? (
          <div className="relative">
            <img
              src={bannerUrl}
              alt={t("bannerPreviewAlt")}
              className="h-32 w-full rounded-md object-cover"
            />
            <button
              type="button"
              onClick={() => setBannerUrl(undefined)}
              className="absolute right-2 top-2 rounded-full bg-background/80 px-2 py-1 text-xs"
            >
              {t("form.cancel")}
            </button>
          </div>
        ) : (
          <FileUpload
            category="image"
            onUploadComplete={(_fileUploadId, _objectKey, publicUrl) => setBannerUrl(publicUrl)}
            onError={(err) => setError(err)}
          />
        )}
      </div>

      {/* Name */}
      <div className="space-y-1">
        <label htmlFor="group-name" className="text-sm font-medium">
          {t("form.name")} <span aria-hidden="true">*</span>
        </label>
        <input
          id="group-name"
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
        <label htmlFor="group-description" className="text-sm font-medium">
          {t("form.description")}
        </label>
        <textarea
          id="group-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={1000}
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      {/* Visibility */}
      <div className="space-y-1">
        <label htmlFor="group-visibility" className="text-sm font-medium">
          {t("form.visibility")}
        </label>
        <select
          id="group-visibility"
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
        <label htmlFor="group-join-type" className="text-sm font-medium">
          {t("form.joinType")}
        </label>
        <select
          id="group-join-type"
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
        <label htmlFor="group-posting-permission" className="text-sm font-medium">
          {t("form.postingPermission")}
        </label>
        <select
          id="group-posting-permission"
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
        <label htmlFor="group-commenting-permission" className="text-sm font-medium">
          {t("form.commentingPermission")}
        </label>
        <select
          id="group-commenting-permission"
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
        <label htmlFor="group-member-limit" className="text-sm font-medium">
          {t("form.memberLimit")}
        </label>
        <input
          id="group-member-limit"
          type="number"
          value={memberLimit}
          onChange={(e) => setMemberLimit(e.target.value)}
          min={1}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isSubmitting || !name.trim()}
          className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isSubmitting ? "..." : t("form.submit")}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          {t("form.cancel")}
        </button>
      </div>
    </form>
  );
}
