"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { BilingualEditorPane } from "./BilingualEditorPane";
import { ArticleMetaForm } from "./ArticleMetaForm";
import { saveDraftAction, submitArticleAction } from "../actions/article-actions";
import type { ArticleCategory, ArticleVisibility } from "@/db/schema/community-articles";

interface ArticleEditorState {
  enTitle: string;
  enContent: string; // Tiptap JSON stringified
  igTitle: string;
  igContent: string; // Tiptap JSON stringified (empty = no Igbo content)
  category: ArticleCategory;
  coverImageUrl: string | null;
  coverImageUploadId: string | null;
  visibility: ArticleVisibility;
  tags: string[];
}

export interface ArticleEditorInitialData {
  articleId: string;
  title: string;
  titleIgbo?: string | null;
  content: string;
  contentIgbo?: string | null;
  coverImageUrl?: string | null;
  category: ArticleCategory;
  visibility: ArticleVisibility;
  tags?: string[];
  status?: string;
  rejectionFeedback?: string | null;
}

interface ArticleEditorProps {
  /** Present when editing an existing draft */
  articleId?: string;
  /** Initial data when editing */
  initialData?: ArticleEditorInitialData;
  /** Whether this user is Top-tier (can set visibility) */
  canSetVisibility?: boolean;
}

const EMPTY_DOC = '{"type":"doc","content":[]}';

function isContentEmpty(json: string): boolean {
  if (!json || json === EMPTY_DOC) return true;
  try {
    const doc = JSON.parse(json) as { content?: Array<{ content?: unknown[] }> };
    if (!doc.content || doc.content.length === 0) return true;
    // Check if all nodes are empty paragraphs
    return doc.content.every((node) => !node.content || node.content.length === 0);
  } catch {
    return true;
  }
}

export function ArticleEditor({ articleId, initialData, canSetVisibility }: ArticleEditorProps) {
  const t = useTranslations("Articles");
  const [isPendingSave, startSaveTransition] = useTransition();
  const [isPendingSubmit, startSubmitTransition] = useTransition();

  const [activeTab, setActiveTab] = useState<"en" | "ig">("en");
  const [currentArticleId, setCurrentArticleId] = useState<string | undefined>(articleId);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [state, setState] = useState<ArticleEditorState>({
    enTitle: initialData?.title ?? "",
    enContent: initialData?.content ?? EMPTY_DOC,
    igTitle: initialData?.titleIgbo ?? "",
    igContent: initialData?.contentIgbo ?? EMPTY_DOC,
    category: initialData?.category ?? "discussion",
    coverImageUrl: initialData?.coverImageUrl ?? null,
    coverImageUploadId: null,
    visibility: initialData?.visibility ?? "members_only",
    tags: initialData?.tags ?? [],
  });

  const englishValid = state.enTitle.trim().length > 0 && !isContentEmpty(state.enContent);
  const hasIgboContent = !isContentEmpty(state.igContent);
  const igboValid = !hasIgboContent || state.igTitle.trim().length > 0;
  const canSubmit = englishValid && igboValid;

  const handleSaveDraft = () => {
    setSaveError(null);
    startSaveTransition(async () => {
      const result = await saveDraftAction({
        articleId: currentArticleId,
        title: state.enTitle,
        titleIgbo: state.igTitle || null,
        content: state.enContent,
        contentIgbo: hasIgboContent ? state.igContent : null,
        category: state.category,
        visibility: state.visibility,
        coverImageUrl: state.coverImageUrl,
        tags: state.tags,
      });

      if (!result.success) {
        setSaveError(result.error);
        return;
      }

      setCurrentArticleId(result.articleId);
    });
  };

  const handleSubmit = () => {
    if (!canSubmit || !currentArticleId) return;
    setSubmitError(null);
    startSubmitTransition(async () => {
      const result = await submitArticleAction({ articleId: currentArticleId });
      if (!result.success) {
        setSubmitError(result.error);
      }
      // On success, the action handles redirect
    });
  };

  const isPending = isPendingSave || isPendingSubmit;

  const showRejectionBanner = initialData?.status === "rejected" && initialData?.rejectionFeedback;

  return (
    <div className="flex flex-col gap-4">
      {showRejectionBanner && (
        <div className="rounded-md border border-red-500/40 bg-red-950/30 px-4 py-3" role="alert">
          <p className="text-sm font-semibold text-red-400 mb-1">{t("rejectionFeedback")}</p>
          <p className="text-sm text-red-300">{initialData.rejectionFeedback}</p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">
          {currentArticleId ? t("editor.editDraft") : t("editor.newArticle")}
        </h1>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSaveDraft}
          disabled={isPending || !state.enTitle.trim()}
        >
          {isPendingSave ? t("editor.submitting") : t("editor.saveDraft")}
        </Button>
      </div>

      {saveError && (
        <p className="text-sm text-destructive" role="alert">
          {saveError}
        </p>
      )}

      {/* Editor panes */}
      {/* Desktop: side by side. Mobile: tab toggle. Both instances always mounted. */}
      <div>
        {/* Mobile tab bar (hidden on md+) */}
        <div className="flex md:hidden border-b border-border mb-3">
          <button
            type="button"
            onClick={() => setActiveTab("en")}
            aria-pressed={activeTab === "en"}
            className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "en"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground"
            }`}
          >
            {t("editor.englishPane")}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("ig")}
            aria-pressed={activeTab === "ig"}
            className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "ig"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground"
            }`}
          >
            {t("editor.igboPane")}
          </button>
        </div>

        {/* Panes container */}
        <div className="md:flex md:gap-4">
          {/* English pane — always mounted; hidden on mobile when Igbo tab active */}
          <div className={`flex-1 ${activeTab !== "en" ? "hidden md:flex md:flex-1" : ""}`}>
            <BilingualEditorPane
              lang="en"
              title={state.enTitle}
              onTitleChange={(v) => setState((s) => ({ ...s, enTitle: v }))}
              content={state.enContent}
              onContentChange={(v) => setState((s) => ({ ...s, enContent: v }))}
              required
              disabled={isPending}
            />
          </div>

          {/* Igbo pane — always mounted; hidden on mobile when English tab active */}
          <div className={`flex-1 ${activeTab !== "ig" ? "hidden md:flex md:flex-1" : ""}`}>
            <BilingualEditorPane
              lang="ig"
              title={state.igTitle}
              onTitleChange={(v) => setState((s) => ({ ...s, igTitle: v }))}
              content={state.igContent}
              onContentChange={(v) => setState((s) => ({ ...s, igContent: v }))}
              required={false}
              disabled={isPending}
            />
          </div>
        </div>
      </div>

      {/* Igbo title warning */}
      {hasIgboContent && !state.igTitle.trim() && (
        <p className="text-sm text-destructive" role="alert">
          {t("validation.igboTitleRequired")}
        </p>
      )}

      {/* Meta form */}
      <ArticleMetaForm
        category={state.category}
        onCategoryChange={(v) => setState((s) => ({ ...s, category: v }))}
        tags={state.tags}
        onTagsChange={(tags) => setState((s) => ({ ...s, tags }))}
        coverImageUrl={state.coverImageUrl}
        onCoverImageChange={(url, uploadId) =>
          setState((s) => ({ ...s, coverImageUrl: url, coverImageUploadId: uploadId }))
        }
        showVisibility={!!canSetVisibility}
        visibility={state.visibility}
        onVisibilityChange={(v) => setState((s) => ({ ...s, visibility: v }))}
        disabled={isPending}
      />

      {/* Submit */}
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || !currentArticleId || isPending}
          aria-label={t("submit.button")}
        >
          {isPendingSubmit ? t("editor.submitting") : t("submit.button")}
        </Button>
      </div>

      {submitError && (
        <p className="text-sm text-destructive text-right" role="alert">
          {submitError}
        </p>
      )}
    </div>
  );
}
