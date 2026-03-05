"use client";

import { useTranslations } from "next-intl";
import { TiptapEditor } from "./TiptapEditor";

interface BilingualEditorPaneProps {
  lang: "en" | "ig";
  title: string;
  onTitleChange: (value: string) => void;
  content: string;
  onContentChange: (json: string) => void;
  required?: boolean;
  disabled?: boolean;
}

export function BilingualEditorPane({
  lang,
  title,
  onTitleChange,
  content,
  onContentChange,
  required,
  disabled,
}: BilingualEditorPaneProps) {
  const t = useTranslations("Articles");

  const isEnglish = lang === "en";
  const paneLabel = isEnglish ? t("editor.englishPane") : t("editor.igboPane");
  const titlePlaceholder = t("editor.titlePlaceholder");
  const bodyPlaceholder = t("editor.bodyPlaceholder");
  const optionalNote = !required ? t("editor.igboOptional") : undefined;

  return (
    <div className="flex flex-col gap-3 flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">{paneLabel}</span>
        {optionalNote && <span className="text-xs text-muted-foreground">({optionalNote})</span>}
      </div>
      <input
        type="text"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder={titlePlaceholder}
        required={required}
        disabled={disabled}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground disabled:opacity-50"
        maxLength={255}
        aria-label={`${paneLabel} title`}
      />
      <TiptapEditor
        content={content}
        onChange={onContentChange}
        placeholder={bodyPlaceholder}
        disabled={disabled}
      />
    </div>
  );
}
