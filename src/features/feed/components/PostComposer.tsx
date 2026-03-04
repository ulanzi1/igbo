"use client";

import { useState, useTransition } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapLink from "@tiptap/extension-link";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/shared/FileUpload";
import { createPost } from "../actions/create-post";
import type { PostCategory } from "@/db/schema/community-posts";
import type { FeedSortMode, FeedFilter } from "@/config/feed";

interface PostComposerProps {
  /** From session — shown in "What's on your mind, [Name]?" */
  userName: string;
  /** From server — if false, show tier-blocked message instead of editor */
  canCreatePost: boolean;
  /** Avatar URL from the user's community profile, if available */
  photoUrl?: string | null;
  /** Current feed sort/filter — used to invalidate the correct query key */
  sort: FeedSortMode;
  filter: FeedFilter;
  /** When set, post is created in this group instead of the global feed */
  groupId?: string;
}

interface PendingMedia {
  fileUploadId: string;
  mediaType: "image" | "video" | "audio";
  filename: string; // From objectKey — used for fallback preview
  previewUrl: string; // Direct S3 URL for thumbnail preview
}

export function PostComposer({
  userName,
  canCreatePost,
  photoUrl,
  sort,
  filter,
  groupId,
}: PostComposerProps) {
  const t = useTranslations("Feed");
  const tGroups = useTranslations("Groups");
  const queryClient = useQueryClient();

  const [isExpanded, setIsExpanded] = useState(false);
  const [category, setCategory] = useState<PostCategory>("discussion");
  const [pendingMedia, setPendingMedia] = useState<PendingMedia[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [limitResetDate, setLimitResetDate] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // Tiptap editor — StarterKit + Link only for Story 4.2
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit, TiptapLink.configure({ openOnClick: false })],
    editorProps: {
      attributes: {
        class: "min-h-[80px] outline-none prose prose-sm max-w-none",
        "aria-label": t("composer.placeholder", { name: userName }),
      },
    },
  });

  const getContentType = () => {
    if (!editor) return "text" as const;
    const json = editor.getJSON();
    const hasFormatting = JSON.stringify(json).includes('"marks"');
    return hasFormatting ? ("rich_text" as const) : ("text" as const);
  };

  const handleSubmit = () => {
    if (!editor) return;
    const rawContent = editor.getText().trim();
    if (!rawContent && pendingMedia.length === 0) return;

    const contentType = getContentType();
    const content = contentType === "rich_text" ? JSON.stringify(editor.getJSON()) : rawContent;

    setSubmitError(null);
    setLimitResetDate(null);

    startTransition(async () => {
      const result = await createPost({
        content,
        contentType,
        category,
        fileUploadIds: pendingMedia.map((m) => m.fileUploadId),
        mediaTypes: pendingMedia.map((m) => m.mediaType),
        ...(groupId ? { groupId } : {}),
      });

      if (!result.success) {
        if (result.errorCode === "LIMIT_REACHED" && "resetDate" in result) {
          setLimitResetDate(result.resetDate ?? null);
        }
        setSubmitError(result.reason);
        return;
      }

      // Success: clean up + invalidate feed query
      editor.commands.clearContent();
      setPendingMedia([]);
      setCategory("discussion");
      setIsExpanded(false);
      if (groupId) {
        await queryClient.invalidateQueries({ queryKey: ["group-feed", groupId] });
      } else {
        await queryClient.invalidateQueries({ queryKey: ["feed"] });
      }
    });
  };

  // FileUpload only gives (fileUploadId, objectKey) — no File object.
  // Show filename-only preview. Derive filename from objectKey, default mediaType to "image".
  const handleMediaUploadComplete = (
    fileUploadId: string,
    objectKey: string,
    publicUrl: string,
  ) => {
    const filename = objectKey.split("/").pop() ?? "attachment";
    const mediaType: "image" | "video" | "audio" = objectKey.match(
      /\.(mp4|mov|webm|avi|mkv|wmv|3gp|ogv)$/i,
    )
      ? "video"
      : objectKey.match(/\.(mp3|wav|mpeg|ogg|m4a|aac|flac|wma)$/i)
        ? "audio"
        : "image";
    setPendingMedia((prev) => [
      ...prev,
      { fileUploadId, mediaType, filename, previewUrl: publicUrl },
    ]);
  };

  const removeMedia = (fileUploadId: string) => {
    setPendingMedia((prev) => prev.filter((m) => m.fileUploadId !== fileUploadId));
  };

  // BLOCKED: Basic tier members see a message, not the editor
  if (!canCreatePost) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        {t("composer.tierBlocked")}
      </div>
    );
  }

  // Collapsed trigger
  const CollapsedTrigger = (
    <button
      type="button"
      className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-4 text-left text-muted-foreground hover:bg-accent/50 transition-colors min-h-[44px]"
      onClick={() => {
        setIsExpanded(true);
      }}
    >
      <Avatar className="h-9 w-9 shrink-0">
        <AvatarImage src={photoUrl ?? undefined} alt={userName} />
        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
      </Avatar>
      <span className="text-sm">{t("composer.placeholderCollapsed")}</span>
    </button>
  );

  // The expanded editor form (shared between inline and Dialog)
  const EditorForm = (
    <div className="space-y-3">
      {/* Tiptap editor */}
      <EditorContent
        editor={editor}
        className="rounded-md border border-input bg-background px-3 py-2 text-sm"
      />

      {/* Format toolbar */}
      {editor && (
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            aria-label={t("composer.bold")}
            aria-pressed={editor.isActive("bold")}
            className={`rounded px-2 py-1 text-xs font-bold min-h-[32px] border border-border transition-colors ${
              editor.isActive("bold")
                ? "bg-primary text-primary-foreground"
                : "bg-background hover:bg-accent"
            }`}
          >
            B
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            aria-label={t("composer.italic")}
            aria-pressed={editor.isActive("italic")}
            className={`rounded px-2 py-1 text-xs italic min-h-[32px] border border-border transition-colors ${
              editor.isActive("italic")
                ? "bg-primary text-primary-foreground"
                : "bg-background hover:bg-accent"
            }`}
          >
            I
          </button>
        </div>
      )}

      {/* Media previews */}
      {pendingMedia.length > 0 && (
        <div className={`grid gap-2 ${pendingMedia.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
          {pendingMedia.slice(0, 4).map((m) => (
            <div
              key={m.fileUploadId}
              className="relative rounded-md overflow-hidden bg-muted aspect-video"
            >
              {m.mediaType === "image" ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={m.previewUrl}
                  alt={m.filename}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : m.mediaType === "video" ? (
                <video
                  src={m.previewUrl}
                  className="absolute inset-0 h-full w-full object-contain bg-black"
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground p-2 text-center">
                  <span>🎵</span>
                  <span className="truncate max-w-full">{m.filename}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => removeMedia(m.fileUploadId)}
                aria-label={t("composer.removeMedia")}
                className="absolute top-1 right-1 rounded-full bg-black/60 text-white p-1 min-h-[32px] min-w-[32px] flex items-center justify-center text-xs"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Category selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">{t("composer.categoryLabel")}:</span>
        {(["discussion", "event", "announcement"] as const).map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            aria-pressed={category === cat}
            className={`rounded-full px-2.5 py-1 text-xs font-medium min-h-[32px] border transition-colors ${
              category === cat
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border bg-background hover:bg-accent"
            }`}
          >
            {t(
              `composer.category${cat.charAt(0).toUpperCase()}${cat.slice(1)}` as Parameters<
                typeof t
              >[0],
            )}
          </button>
        ))}
      </div>

      {/* File upload (images, videos, audio — max 4 combined) */}
      {pendingMedia.length < 4 && (
        <div className="flex gap-2">
          <FileUpload
            category="media"
            onUploadComplete={handleMediaUploadComplete}
            disabled={isPending}
          />
        </div>
      )}

      {/* Error states */}
      {submitError && (
        <p className="text-sm text-destructive" role="alert">
          {submitError === "Feed.composer.limitReached" && limitResetDate
            ? t("composer.limitReached", {
                resetDate: new Date(limitResetDate).toLocaleDateString(),
              })
            : submitError === "Permissions.feedPostRequired"
              ? t("composer.tierBlocked")
              : submitError === "Groups.moderation.mutedCannotPost" ||
                  submitError === "Groups.moderation.bannedCannotPost"
                ? tGroups(
                    submitError === "Groups.moderation.mutedCannotPost"
                      ? "moderation.mutedCannotPost"
                      : "moderation.bannedCannotPost",
                  )
                : t("composer.errorGeneric")}
        </p>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setIsExpanded(false);
            setSubmitError(null);
            setCategory("discussion");
            editor?.commands.clearContent();
            setPendingMedia([]);
          }}
        >
          {t("composer.cancel")}
        </Button>
        <Button type="button" size="sm" disabled={isPending} onClick={handleSubmit}>
          {isPending ? t("composer.submitting") : t("composer.submit")}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-2">
      {/* Collapsed trigger — always visible when not expanded */}
      {!isExpanded && CollapsedTrigger}

      {/* Expanded editor form (inline card on all screen sizes) */}
      {isExpanded && (
        <div className="rounded-lg border border-border bg-card p-4">{EditorForm}</div>
      )}
    </div>
  );
}
