"use client";

import { useState, useRef, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapLink from "@tiptap/extension-link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PortalRichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  "aria-label"?: string;
}

export function PortalRichTextEditor({
  content,
  onChange,
  placeholder,
  disabled,
  maxLength,
  "aria-label": ariaLabel,
}: PortalRichTextEditorProps) {
  const t = useTranslations("Portal.editor");

  const [linkInputOpen, setLinkInputOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const linkInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit, TiptapLink.configure({ openOnClick: false })],
    content: content || undefined,
    editable: !disabled,
    editorProps: {
      attributes: {
        class: "min-h-[180px] outline-none prose prose-sm max-w-none p-3",
        "aria-label": placeholder ?? "",
      },
    },
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML());
    },
  });

  const characterCount = editor ? editor.getText().length : 0;
  const isNearLimit = maxLength ? characterCount > maxLength : characterCount > 10000;

  const handleLinkToggle = useCallback(() => {
    if (!editor) return;
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    setLinkUrl("");
    setLinkInputOpen(true);
    setTimeout(() => linkInputRef.current?.focus(), 0);
  }, [editor]);

  const applyLink = useCallback(() => {
    if (!editor || !linkUrl.trim()) return;
    const href = linkUrl.trim().startsWith("http") ? linkUrl.trim() : `https://${linkUrl.trim()}`;
    editor.chain().focus().setLink({ href }).run();
    setLinkInputOpen(false);
    setLinkUrl("");
  }, [editor, linkUrl]);

  const cancelLink = useCallback(() => {
    setLinkInputOpen(false);
    setLinkUrl("");
    editor?.chain().focus().run();
  }, [editor]);

  const btnClass = (active: boolean) =>
    `rounded px-2 py-1 text-xs min-h-[28px] border border-transparent transition-colors ${
      active ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"
    }`;

  return (
    <div className="rounded-md border border-input bg-background text-sm">
      {editor && (
        <>
          {/* Toolbar */}
          <div
            role="toolbar"
            aria-label={ariaLabel ? `${ariaLabel} toolbar` : "Editor toolbar"}
            className="flex flex-wrap gap-1 border-b border-border px-2 py-1"
          >
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              aria-pressed={editor.isActive("heading", { level: 2 })}
              aria-label={t("heading2")}
              className={`${btnClass(editor.isActive("heading", { level: 2 }))} font-semibold`}
            >
              H2
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              aria-pressed={editor.isActive("heading", { level: 3 })}
              aria-label={t("heading3")}
              className={`${btnClass(editor.isActive("heading", { level: 3 }))} font-semibold`}
            >
              H3
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBold().run()}
              aria-pressed={editor.isActive("bold")}
              aria-label={t("bold")}
              className={`${btnClass(editor.isActive("bold"))} font-bold`}
            >
              B
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleItalic().run()}
              aria-pressed={editor.isActive("italic")}
              aria-label={t("italic")}
              className={`${btnClass(editor.isActive("italic"))} italic`}
            >
              I
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              aria-pressed={editor.isActive("bulletList")}
              aria-label={t("bulletList")}
              className={btnClass(editor.isActive("bulletList"))}
            >
              •—
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              aria-pressed={editor.isActive("orderedList")}
              aria-label={t("orderedList")}
              className={btnClass(editor.isActive("orderedList"))}
            >
              1.
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              aria-pressed={editor.isActive("blockquote")}
              aria-label={t("blockquote")}
              className={btnClass(editor.isActive("blockquote"))}
            >
              ❝
            </button>
            <button
              type="button"
              aria-label={editor.isActive("link") ? t("removeLink") : t("link")}
              aria-pressed={editor.isActive("link")}
              onClick={handleLinkToggle}
              className={btnClass(editor.isActive("link"))}
            >
              {t("link")}
            </button>
          </div>

          {/* Inline link input row */}
          {linkInputOpen && (
            <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-2 py-1.5">
              <span className="shrink-0 text-xs text-muted-foreground">{t("linkUrl")}</span>
              <Input
                ref={linkInputRef}
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyLink();
                  }
                  if (e.key === "Escape") cancelLink();
                }}
                placeholder="https://..."
                className="h-7 flex-1 text-xs"
              />
              <Button size="sm" variant="default" className="h-7 px-2 text-xs" onClick={applyLink}>
                {t("linkApply")}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={cancelLink}>
                {t("linkCancel")}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Editor content area — wrapped in div with aria-label for accessibility */}
      <div role="group" aria-label={ariaLabel}>
        <EditorContent editor={editor} />
      </div>

      {/* Character count */}
      <div
        className={`px-3 py-1 text-right text-xs ${
          isNearLimit ? "text-destructive" : "text-muted-foreground"
        }`}
      >
        {t("characterCount", { count: String(characterCount) })}
      </div>
    </div>
  );
}

export function PortalRichTextEditorSkeleton() {
  return (
    <div className="rounded-md border border-input bg-background text-sm">
      <div className="flex gap-1 border-b border-border px-2 py-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-7 w-8 animate-pulse rounded bg-muted" />
        ))}
      </div>
      <div className="min-h-[180px] animate-pulse bg-muted/20" />
    </div>
  );
}
