"use client";

import { useState, useRef, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapImage from "@tiptap/extension-image";
import TiptapMention from "@tiptap/extension-mention";
import { useTranslations } from "next-intl";
import { buildMentionSuggestion } from "../utils/mention-suggestion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileUpload } from "@/components/shared/FileUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface TiptapEditorProps {
  content: string; // Tiptap JSON stringified (or empty string for new)
  onChange: (json: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function TiptapEditor({ content, onChange, placeholder, disabled }: TiptapEditorProps) {
  const t = useTranslations("Articles");

  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [linkInputOpen, setLinkInputOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const linkInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      TiptapImage.configure({ inline: false }),
      TiptapMention.configure({
        suggestion: buildMentionSuggestion({
          noResultsLabel: t("mentions.noResults"),
        }),
      }),
    ],
    content: content ? (JSON.parse(content) as object) : undefined,
    editable: !disabled,
    editorProps: {
      attributes: {
        class: "min-h-[200px] outline-none prose prose-sm max-w-none p-3",
        "aria-label": placeholder ?? t("editor.bodyPlaceholder"),
      },
    },
    onUpdate: ({ editor: e }) => {
      onChange(JSON.stringify(e.getJSON()));
    },
  });

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
          <div className="flex flex-wrap gap-1 border-b border-border px-2 py-1">
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              aria-pressed={editor.isActive("heading", { level: 2 })}
              aria-label="H2"
              className={`${btnClass(editor.isActive("heading", { level: 2 }))} font-semibold`}
            >
              H2
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              aria-pressed={editor.isActive("heading", { level: 3 })}
              aria-label="H3"
              className={`${btnClass(editor.isActive("heading", { level: 3 }))} font-semibold`}
            >
              H3
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBold().run()}
              aria-pressed={editor.isActive("bold")}
              aria-label="Bold"
              className={`${btnClass(editor.isActive("bold"))} font-bold`}
            >
              B
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleItalic().run()}
              aria-pressed={editor.isActive("italic")}
              aria-label="Italic"
              className={`${btnClass(editor.isActive("italic"))} italic`}
            >
              I
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              aria-pressed={editor.isActive("bulletList")}
              aria-label="Bullet list"
              className={btnClass(editor.isActive("bulletList"))}
            >
              •—
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              aria-pressed={editor.isActive("orderedList")}
              aria-label="Ordered list"
              className={btnClass(editor.isActive("orderedList"))}
            >
              1.
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              aria-pressed={editor.isActive("blockquote")}
              aria-label="Blockquote"
              className={btnClass(editor.isActive("blockquote"))}
            >
              ❝
            </button>
            <button
              type="button"
              aria-label={t("editor.insertImage")}
              onClick={() => setImageDialogOpen(true)}
              className={btnClass(false)}
            >
              Img
            </button>
            <button
              type="button"
              aria-label={editor.isActive("link") ? t("editor.removeLink") : t("editor.insertLink")}
              onClick={handleLinkToggle}
              className={btnClass(editor.isActive("link"))}
            >
              Link
            </button>
          </div>

          {/* Inline link input row */}
          {linkInputOpen && (
            <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-2 py-1.5">
              <span className="shrink-0 text-xs text-muted-foreground">{t("editor.linkUrl")}</span>
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
                {t("editor.linkApply")}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={cancelLink}>
                {t("editor.linkCancel")}
              </Button>
            </div>
          )}
        </>
      )}

      <EditorContent editor={editor} />

      {/* Image upload dialog */}
      <Dialog open={imageDialogOpen} onOpenChange={setImageDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("editor.insertImage")}</DialogTitle>
          </DialogHeader>
          <FileUpload
            category="image"
            accept="image/*"
            onUploadComplete={(_fileUploadId, _objectKey, publicUrl) => {
              editor?.chain().focus().setImage({ src: publicUrl }).run();
              setImageDialogOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
