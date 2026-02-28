"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { SendIcon, AlignJustifyIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { AttachmentButton } from "./AttachmentButton";
import { FormattingToolbar } from "./FormattingToolbar";
import { useFileAttachment } from "@/features/chat/hooks/use-file-attachment";
import type { UploadedFileInfo } from "@/features/chat/hooks/use-file-attachment";
import type { FormatSyntax } from "./FormattingToolbar";
import type { ChatMessage, GroupMember } from "@/features/chat/types";

interface MessageInputProps {
  onSend: (
    content: string,
    attachmentFileUploadIds: string[],
    contentType: "text" | "rich_text",
    parentMessageId?: string,
  ) => Promise<void>;
  autoFocus?: boolean;
  disabled?: boolean;
  replyTo?: ChatMessage | null;
  onClearReply?: () => void;
  members?: GroupMember[];
  memberDisplayNameMap?: Record<string, string>;
}

/** Detect mention token: text -> @query before cursor */
function detectMentionQuery(text: string, cursorPos: number): string | null {
  const textBeforeCursor = text.slice(0, cursorPos);
  const match = /@(\w*)$/.exec(textBeforeCursor);
  return match ? (match[1] ?? "") : null;
}

/** Replace the active @query token with just @DisplayName (visible text) */
function insertMention(
  text: string,
  cursorPos: number,
  displayName: string,
): { newText: string; newCursorPos: number } {
  const textBeforeCursor = text.slice(0, cursorPos);
  const match = /@(\w*)$/.exec(textBeforeCursor);
  if (!match) return { newText: text, newCursorPos: cursorPos };

  const tokenStart = cursorPos - match[0].length;
  const visibleMention = `@${displayName}`;
  const newText = text.slice(0, tokenStart) + visibleMention + " " + text.slice(cursorPos);
  const newCursorPos = tokenStart + visibleMention.length + 1;
  return { newText, newCursorPos };
}

/** Reconstruct full mention tokens from display text + mention map before sending */
function reconstructMentionTokens(text: string, mentionMap: Map<string, string>): string {
  let result = text;
  for (const [displayName, userId] of mentionMap) {
    // Replace @DisplayName with full token — use word boundary to avoid partial matches
    const pattern = new RegExp(
      `@${displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$|[.,!?;:])`,
      "g",
    );
    result = result.replace(pattern, `@[${displayName}](mention:${userId})`);
  }
  return result;
}

const RICH_TEXT_PATTERN = /\*\*|~~|`|\[.*\]\(|@\[[^\]]+\]\(mention:/;
/** Check if text has mentions by looking for @DisplayName patterns from the mention map */
function hasMentions(mentionMap: Map<string, string>): boolean {
  return mentionMap.size > 0;
}

const MAX_AUTOCOMPLETE_RESULTS = 5;

export function MessageInput({
  onSend,
  autoFocus = false,
  disabled = false,
  replyTo,
  onClearReply,
  members = [],
  memberDisplayNameMap,
}: MessageInputProps) {
  const tInput = useTranslations("Chat.input");
  const tRichText = useTranslations("Chat.richText");
  const tAttachments = useTranslations("Chat.attachments");
  const tReply = useTranslations("Chat.reply");
  const tMentions = useTranslations("Chat.mentions");
  const [content, setContent] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);
  const [contentType, setContentType] = useState<"text" | "rich_text">("text");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // @mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionHighlight, setMentionHighlight] = useState(0);

  // Track mentions: displayName → userId (used to reconstruct full tokens on send)
  const mentionMapRef = useRef<Map<string, string>>(new Map());

  const { pendingUploads, isUploading, addFiles, removeFile } = useFileAttachment();

  useEffect(() => {
    if (autoFocus) {
      textareaRef.current?.focus();
    }
  }, [autoFocus]);

  // Filtered members for autocomplete
  const filteredMembers =
    mentionQuery !== null && members.length > 0
      ? members
          .filter((m) => m.displayName.toLowerCase().includes(mentionQuery.toLowerCase()))
          .slice(0, MAX_AUTOCOMPLETE_RESULTS)
      : [];

  const closeMentionDropdown = useCallback(() => {
    setMentionQuery(null);
    setMentionHighlight(0);
  }, []);

  // Escape key handler for autocomplete — cleaned up on unmount
  useEffect(() => {
    if (mentionQuery === null) return;

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeMentionDropdown();
      }
    }

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [mentionQuery, closeMentionDropdown]);

  const handleFormat = useCallback(
    (syntax: FormatSyntax) => {
      const el = textareaRef.current;
      if (!el) return;

      const start = el.selectionStart;
      const end = el.selectionEnd;
      const selected = content.slice(start, end);

      let prefix = "";
      let suffix = "";
      let placeholder = "";

      switch (syntax) {
        case "bold":
          prefix = "**";
          suffix = "**";
          placeholder = tRichText("boldPlaceholder");
          break;
        case "italic":
          prefix = "*";
          suffix = "*";
          placeholder = tRichText("italicPlaceholder");
          break;
        case "strikethrough":
          prefix = "~~";
          suffix = "~~";
          placeholder = tRichText("strikethroughPlaceholder");
          break;
        case "code":
          prefix = "`";
          suffix = "`";
          placeholder = tRichText("codePlaceholder");
          break;
        case "link":
          prefix = "[";
          suffix = "](url)";
          placeholder = tRichText("linkPlaceholder");
          break;
      }

      const textToWrap = selected || placeholder;
      const newContent =
        content.slice(0, start) + prefix + textToWrap + suffix + content.slice(end);
      setContent(newContent);
      setContentType("rich_text");

      // Restore focus and position cursor after prefix
      setTimeout(() => {
        el.focus();
        const newPos = start + prefix.length + textToWrap.length;
        el.setSelectionRange(newPos, newPos);
      }, 0);
    },
    [content, tRichText],
  );

  const handleSend = useCallback(async () => {
    const trimmed = content.trim();
    const hasCompletedUploads = pendingUploads.some((u) => u.status === "done");
    const hasPendingUploads = pendingUploads.some((u) => u.status === "uploading");

    if ((!trimmed && !hasCompletedUploads) || isSending || hasPendingUploads) return;

    setIsSending(true);
    setHasError(false);

    try {
      const uploadIds = pendingUploads
        .filter(
          (u): u is UploadedFileInfo & { status: "done" } =>
            u.status === "done" && "fileUploadId" in u,
        )
        .map((u) => u.fileUploadId);

      // Reconstruct full mention tokens from @DisplayName → @[DisplayName](mention:userId)
      const finalContent =
        mentionMapRef.current.size > 0
          ? reconstructMentionTokens(trimmed, mentionMapRef.current)
          : trimmed;
      const finalContentType =
        mentionMapRef.current.size > 0 ? ("rich_text" as const) : contentType;

      await onSend(finalContent, uploadIds, finalContentType, replyTo?.messageId);
      setContent("");
      setContentType("text");
      mentionMapRef.current = new Map();
      closeMentionDropdown();
      // Clear all pending uploads
      for (const upload of [...pendingUploads]) {
        removeFile(upload.tempId);
      }
      // Auto-resize textarea back to default height
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch {
      setHasError(true);
    } finally {
      setIsSending(false);
    }
  }, [
    content,
    isSending,
    onSend,
    pendingUploads,
    removeFile,
    contentType,
    replyTo,
    closeMentionDropdown,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Handle autocomplete keyboard nav
      if (mentionQuery !== null && filteredMembers.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setMentionHighlight((h) => (h + 1) % filteredMembers.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setMentionHighlight((h) => (h - 1 + filteredMembers.length) % filteredMembers.length);
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          const selected = filteredMembers[mentionHighlight];
          if (selected) {
            selectMention(selected);
          }
          return;
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend, mentionQuery, filteredMembers, mentionHighlight], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const selectMention = useCallback(
    (member: GroupMember) => {
      const el = textareaRef.current;
      if (!el) return;

      const cursorPos = el.selectionStart;
      const { newText, newCursorPos } = insertMention(content, cursorPos, member.displayName);
      setContent(newText);
      mentionMapRef.current.set(member.displayName, member.id);
      closeMentionDropdown();

      setTimeout(() => {
        el.focus();
        el.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    },
    [content, closeMentionDropdown],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setContent(value);
      setHasError(false);
      // Auto-resize textarea
      const el = e.target;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
      // Set content type (markdown syntax or active mentions → rich_text)
      setContentType(
        RICH_TEXT_PATTERN.test(value) || hasMentions(mentionMapRef.current) ? "rich_text" : "text",
      );

      // Detect @mention query
      const cursor = el.selectionStart;
      const query = detectMentionQuery(value, cursor);
      if (query !== null && members.length > 0) {
        setMentionQuery(query);
        setMentionHighlight(0);
      } else {
        closeMentionDropdown();
      }
    },
    [members.length, closeMentionDropdown],
  );

  const handleSelect = useCallback(
    (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
      const el = e.currentTarget;
      const cursor = el.selectionStart;
      const query = detectMentionQuery(content, cursor);
      if (query === null) {
        closeMentionDropdown();
      }
    },
    [content, closeMentionDropdown],
  );

  const completedUploads = pendingUploads.filter((u) => u.status === "done");
  const uploadingCount = pendingUploads.filter((u) => u.status === "uploading").length;
  const canSend =
    (content.trim().length > 0 || completedUploads.length > 0) &&
    !isSending &&
    !disabled &&
    !isUploading;

  const replyToSenderName = replyTo
    ? (memberDisplayNameMap?.[replyTo.senderId] ?? replyTo.senderId)
    : null;

  return (
    <div
      className={cn(
        "flex flex-col border-t border-border bg-background",
        hasError && "bg-destructive/5",
      )}
    >
      {/* Reply preview panel */}
      {replyTo && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/40">
          <div className="flex-1 min-w-0 border-l-2 border-primary pl-2">
            <span className="text-xs font-semibold text-primary block">
              {tReply("replyingTo", { name: replyToSenderName ?? "" })}
            </span>
            <span className="text-xs text-muted-foreground block truncate">
              {replyTo.deletedAt
                ? tReply("deletedParent")
                : replyTo.content.slice(0, 80) + (replyTo.content.length > 80 ? "…" : "")}
            </span>
          </div>
          <button
            type="button"
            onClick={onClearReply}
            aria-label={tReply("dismissReply")}
            className="flex-shrink-0 text-muted-foreground hover:text-foreground"
          >
            <XIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Formatting toolbar (toggle-able) */}
      {showToolbar && <FormattingToolbar onFormat={handleFormat} />}

      {/* Upload progress area */}
      {pendingUploads.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 py-2 border-b border-border">
          {pendingUploads.map((upload) => (
            <div
              key={upload.tempId}
              className="flex items-center gap-2 rounded-md bg-muted px-2 py-1 text-xs"
            >
              <span className="max-w-[100px] truncate text-foreground">{upload.fileName}</span>
              {upload.status === "uploading" && (
                <span className="text-muted-foreground">
                  {tAttachments("uploading")} {Math.round(upload.progress)}%
                </span>
              )}
              {upload.status === "error" && (
                <span className="text-destructive">{tAttachments("uploadFailed")}</span>
              )}
              <button
                type="button"
                onClick={() => removeFile(upload.tempId)}
                aria-label={tAttachments("removeFile", { name: upload.fileName })}
                className="ml-1 text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main input row */}
      <div className="relative flex items-end gap-2 px-3 py-2">
        {/* @mention autocomplete dropdown */}
        {mentionQuery !== null && filteredMembers.length > 0 && (
          <div className="absolute bottom-full left-3 right-3 mb-1 z-20 rounded-md border border-border bg-background shadow-lg">
            {filteredMembers.map((member, idx) => (
              <button
                key={member.id}
                type="button"
                onClick={() => selectMention(member)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted transition-colors",
                  idx === mentionHighlight && "bg-muted",
                )}
              >
                <div className="h-6 w-6 flex-shrink-0 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                  {member.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={member.photoUrl}
                      alt={member.displayName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-xs font-semibold">
                      {member.displayName.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <span className="font-medium">{member.displayName}</span>
              </button>
            ))}
          </div>
        )}

        {mentionQuery !== null && members.length > 0 && filteredMembers.length === 0 && (
          <div className="absolute bottom-full left-3 right-3 mb-1 z-20 rounded-md border border-border bg-background shadow-lg px-3 py-2 text-sm text-muted-foreground">
            {tMentions("noResults")}
          </div>
        )}

        {/* Attachment button */}
        <AttachmentButton onFilesSelected={addFiles} disabled={disabled || isSending} />

        {/* Toolbar toggle button — hidden on mobile by default */}
        <button
          type="button"
          onClick={() => setShowToolbar((v) => !v)}
          aria-label={tRichText("toggleToolbar")}
          aria-pressed={showToolbar}
          className={cn(
            "hidden md:flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md transition-colors",
            showToolbar
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <AlignJustifyIcon className="h-4 w-4" aria-hidden="true" />
        </button>

        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onSelect={handleSelect}
          onKeyUp={handleSelect}
          placeholder={tInput("placeholder")}
          disabled={disabled || isSending}
          rows={1}
          aria-label={tInput("placeholder")}
          className={cn(
            "flex-1 resize-none rounded-md border bg-muted px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground",
            "focus:border-primary focus:ring-1 focus:ring-primary",
            hasError && "border-destructive focus:border-destructive focus:ring-destructive",
            "min-h-[40px] max-h-[120px]",
          )}
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={!canSend}
          aria-label={tInput("sendAriaLabel")}
          className={cn(
            "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md transition-colors",
            canSend
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground cursor-not-allowed",
          )}
        >
          <SendIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Uploading status indicator */}
      {uploadingCount > 0 && (
        <div className="px-3 pb-1 text-xs text-muted-foreground">{tAttachments("uploading")}</div>
      )}
    </div>
  );
}
