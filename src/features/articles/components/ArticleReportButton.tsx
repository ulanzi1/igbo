"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ReportDialog } from "@/components/shared/ReportDialog";

interface ArticleReportButtonProps {
  articleId: string;
  authorId: string;
  viewerUserId?: string;
}

export function ArticleReportButton({
  articleId,
  authorId,
  viewerUserId,
}: ArticleReportButtonProps) {
  const t = useTranslations("Reports");
  const [showReport, setShowReport] = useState(false);

  // Don't show Report on own articles
  if (viewerUserId && viewerUserId === authorId) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setShowReport(true)}
        aria-label={t("action.report")}
        className="text-xs text-muted-foreground hover:text-destructive transition-colors min-h-[44px] px-2"
      >
        🚩 {t("action.report")}
      </button>
      {showReport && (
        <ReportDialog
          contentType="article"
          contentId={articleId}
          onClose={() => setShowReport(false)}
        />
      )}
    </>
  );
}
