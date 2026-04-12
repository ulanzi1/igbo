"use client";

import React, { useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useDensity } from "@/providers/density-context";
import type { ApplicationNote } from "@igbo/db/queries/portal-application-notes";

const MAX_CONTENT_LENGTH = 2000;

export interface NotesSectionProps {
  applicationId: string;
  initialNotes: ApplicationNote[];
}

/**
 * P-2.10: Private employer notes section.
 *
 * Notes are append-only — no edit/delete UI. Newest notes appear at the
 * bottom of the chronological list. Submissions optimistically append
 * the returned note to local state so the UI stays in sync without a
 * refetch. The wrapping panel supplies `initialNotes` via the detail
 * route response on panel open.
 */
export function NotesSection({ applicationId, initialNotes }: NotesSectionProps) {
  const t = useTranslations("Portal.ats.notes");
  const format = useFormatter();
  const { density } = useDensity();

  const [notes, setNotes] = useState<ApplicationNote[]>(initialNotes);
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sectionGap = density === "dense" ? "gap-2" : "gap-3";
  const charCount = content.length;
  const trimmed = content.trim();
  const canSubmit = trimmed.length > 0 && charCount <= MAX_CONTENT_LENGTH && !isSubmitting;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/v1/applications/${applicationId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed }),
      });
      if (!res.ok) {
        throw new Error(`Failed: ${res.status}`);
      }
      const json = (await res.json()) as { data: ApplicationNote };
      // Normalize createdAt to Date since JSON serialization converts to string.
      const newNote: ApplicationNote = {
        ...json.data,
        createdAt: new Date(json.data.createdAt),
      };
      setNotes((prev) => [...prev, newNote]);
      setContent("");
      toast.success(t("saveSuccess"));
    } catch {
      toast.error(t("saveError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="csp-notes-heading" className="flex flex-col gap-3">
      <h3 id="csp-notes-heading" className="text-sm font-semibold">
        {t("heading")}
      </h3>

      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">{t("empty")}</p>
      ) : (
        <ol className={`flex flex-col ${sectionGap}`} aria-label={t("listLabel")}>
          {notes.map((note) => (
            <li
              key={note.id}
              className="rounded-md border border-border bg-muted/30 p-3"
              data-testid="note-item"
            >
              <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {note.authorName ?? t("unknownAuthor")}
                </span>
                <time dateTime={new Date(note.createdAt).toISOString()}>
                  {format.dateTime(new Date(note.createdAt), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </time>
              </div>
              <p className="text-sm whitespace-pre-wrap break-words">{note.content}</p>
            </li>
          ))}
        </ol>
      )}

      <form
        onSubmit={handleSubmit}
        role="form"
        aria-label={t("ariaForm")}
        className="flex flex-col gap-2"
      >
        <label htmlFor="notes-textarea" className="text-xs font-medium text-muted-foreground">
          {t("addLabel")}
        </label>
        <Textarea
          id="notes-textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={t("placeholder")}
          maxLength={MAX_CONTENT_LENGTH}
          rows={3}
          disabled={isSubmitting}
          aria-describedby="notes-char-count"
        />
        <div className="flex items-center justify-between gap-2">
          <span
            id="notes-char-count"
            className={`text-xs ${
              charCount > MAX_CONTENT_LENGTH ? "text-destructive" : "text-muted-foreground"
            }`}
            data-testid="notes-char-count"
          >
            {t("maxLength", { count: charCount })}
          </span>
          <Button type="submit" size="sm" disabled={!canSubmit}>
            {isSubmitting ? t("saving") : t("save")}
          </Button>
        </div>
      </form>
    </section>
  );
}
