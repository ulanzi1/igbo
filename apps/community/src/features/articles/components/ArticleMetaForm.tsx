"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { FileUpload } from "@/components/shared/FileUpload";
import type { ArticleCategory, ArticleVisibility } from "@igbo/db/schema/community-articles";

interface ArticleMetaFormProps {
  category: ArticleCategory;
  onCategoryChange: (value: ArticleCategory) => void;
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  coverImageUrl: string | null;
  onCoverImageChange: (url: string | null, uploadId: string | null) => void;
  showVisibility: boolean;
  visibility: ArticleVisibility;
  onVisibilityChange: (value: ArticleVisibility) => void;
  disabled?: boolean;
}

export function ArticleMetaForm({
  category,
  onCategoryChange,
  tags,
  onTagsChange,
  coverImageUrl,
  onCoverImageChange,
  showVisibility,
  visibility,
  onVisibilityChange,
  disabled,
}: ArticleMetaFormProps) {
  const t = useTranslations("Articles");
  const [tagInput, setTagInput] = useState("");

  const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "," || e.key === "Enter") {
      e.preventDefault();
      addTag(tagInput);
    }
  };

  const handleTagInputBlur = () => {
    if (tagInput.trim()) addTag(tagInput);
  };

  const addTag = (value: string) => {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed || tags.includes(trimmed) || tags.length >= 10) {
      setTagInput("");
      return;
    }
    onTagsChange([...tags, trimmed]);
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    onTagsChange(tags.filter((t) => t !== tag));
  };

  const categories: ArticleCategory[] = ["discussion", "announcement", "event"];

  return (
    <div className="space-y-4 rounded-md border border-border bg-card p-4">
      {/* Category */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{t("meta.category")}</label>
        <div className="flex gap-2 flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => onCategoryChange(cat)}
              aria-pressed={category === cat}
              disabled={disabled}
              className={`rounded-full px-3 py-1 text-xs font-medium min-h-[32px] border transition-colors ${
                category === cat
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border bg-background hover:bg-accent"
              }`}
            >
              {cat === "discussion"
                ? t("meta.categoryDiscussion")
                : cat === "announcement"
                  ? t("meta.categoryAnnouncement")
                  : t("meta.categoryEvent")}
            </button>
          ))}
        </div>
      </div>

      {/* Tags */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{t("meta.tags")}</label>
        <div className="flex flex-wrap gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 min-h-[40px]">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                aria-label={`Remove tag ${tag}`}
                disabled={disabled}
                className="text-muted-foreground hover:text-foreground ml-0.5"
              >
                ×
              </button>
            </span>
          ))}
          {tags.length < 10 && (
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagInputKeyDown}
              onBlur={handleTagInputBlur}
              placeholder={tags.length === 0 ? t("meta.addTagPlaceholder") : ""}
              disabled={disabled}
              className="flex-1 min-w-[80px] outline-none text-xs bg-transparent placeholder:text-muted-foreground"
            />
          )}
        </div>
      </div>

      {/* Cover Image */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">
          {t("meta.coverImage")}{" "}
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        </label>
        {coverImageUrl && (
          <div className="relative w-full max-w-xs rounded-md overflow-hidden aspect-video bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverImageUrl}
              alt={t("meta.coverAlt")}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <button
              type="button"
              onClick={() => onCoverImageChange(null, null)}
              aria-label={t("meta.removeCoverImage")}
              disabled={disabled}
              className="absolute top-1 right-1 rounded-full bg-black/60 text-white p-1 text-xs"
            >
              ×
            </button>
          </div>
        )}
        {!coverImageUrl && (
          <FileUpload
            category="image"
            onUploadComplete={(uploadId, _objectKey, publicUrl) => {
              onCoverImageChange(publicUrl, uploadId);
            }}
            disabled={disabled}
          />
        )}
      </div>

      {/* Visibility (Top-tier only) */}
      {showVisibility && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("meta.visibility")}</label>
          <div className="flex gap-2">
            {(["members_only", "guest"] as ArticleVisibility[]).map((vis) => (
              <button
                key={vis}
                type="button"
                onClick={() => onVisibilityChange(vis)}
                aria-pressed={visibility === vis}
                disabled={disabled}
                className={`rounded-full px-3 py-1 text-xs font-medium min-h-[32px] border transition-colors ${
                  visibility === vis
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border bg-background hover:bg-accent"
                }`}
              >
                {vis === "members_only" ? t("meta.visibilityMembers") : t("meta.visibilityGuest")}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
