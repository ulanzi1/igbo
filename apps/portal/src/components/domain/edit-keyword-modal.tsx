"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ScreeningKeywordCategory } from "@igbo/db/schema/portal-screening-keywords";

interface EditKeywordModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  keyword: {
    id: string;
    phrase: string;
    category: string;
    notes: string | null;
  } | null;
}

const CATEGORIES: ScreeningKeywordCategory[] = ["discriminatory", "illegal", "scam", "other"];

export function EditKeywordModal({
  open,
  onOpenChange,
  onSuccess,
  keyword,
}: EditKeywordModalProps) {
  const t = useTranslations("Portal.admin");
  const [phrase, setPhrase] = useState("");
  const [category, setCategory] = useState<ScreeningKeywordCategory | "">("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (keyword) {
      setPhrase(keyword.phrase);
      setCategory(keyword.category as ScreeningKeywordCategory);
      setNotes(keyword.notes ?? "");
    }
  }, [keyword]);

  function categoryLabel(cat: ScreeningKeywordCategory): string {
    const map: Record<ScreeningKeywordCategory, string> = {
      discriminatory: t("blocklistCategoryDiscriminatory"),
      illegal: t("blocklistCategoryIllegal"),
      scam: t("blocklistCategoryScam"),
      other: t("blocklistCategoryOther"),
    };
    return map[cat];
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword || !phrase.trim() || !category) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/screening/keywords/${keyword.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phrase: phrase.trim(), category, notes: notes.trim() || undefined }),
      });

      if (!res.ok) {
        toast.error(t("blocklistError"));
        return;
      }

      toast.success(t("blocklistUpdateSuccess"));
      onSuccess();
      onOpenChange(false);
    } catch {
      toast.error(t("blocklistError"));
    } finally {
      setLoading(false);
    }
  }

  const isValid = phrase.trim().length >= 2 && category !== "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby="edit-keyword-retroactive-warning">
        <DialogHeader>
          <DialogTitle>{t("blocklistEditTitle")}</DialogTitle>
          <DialogDescription id="edit-keyword-retroactive-warning">
            {t("blocklistRetroactiveWarning")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-phrase">{t("blocklistPhrase")}</Label>
            <Input
              id="edit-phrase"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder={t("blocklistPhrasePlaceholder")}
              data-testid="edit-phrase-input"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-category">{t("blocklistCategory")}</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as ScreeningKeywordCategory)}
            >
              <SelectTrigger id="edit-category" data-testid="edit-category-select">
                <SelectValue placeholder={t("blocklistCategory")} />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {categoryLabel(cat)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-notes">{t("blocklistNotes")}</Label>
            <Textarea
              id="edit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("blocklistNotesPlaceholder")}
              rows={3}
              data-testid="edit-notes-textarea"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={!isValid || loading} data-testid="edit-keyword-submit">
              {loading ? t("submitting") : t("blocklistEdit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditKeywordModalSkeleton() {}
