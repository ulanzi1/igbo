"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ExportCandidatesButtonProps {
  jobId: string;
  applicationCount: number;
}

export function ExportCandidatesButton({ jobId, applicationCount }: ExportCandidatesButtonProps) {
  const t = useTranslations("Portal.ats.export");
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    if (applicationCount === 0) {
      toast.warning(t("noData"));
      return;
    }

    setIsExporting(true);
    try {
      const response = await fetch(`/api/v1/jobs/${jobId}/export`, {
        credentials: "same-origin",
      });

      if (!response.ok) {
        toast.error(t("error"));
        return;
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filename = disposition.match(/filename="(.+)"/)?.[1] ?? "candidates.csv";

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      toast.success(t("success"));
    } catch {
      toast.error(t("error"));
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Button
      variant="outline"
      onClick={handleExport}
      disabled={isExporting}
      aria-label={t("ariaButton")}
    >
      <Download className="mr-2 h-4 w-4" aria-hidden="true" />
      {isExporting ? t("downloading") : t("button")}
    </Button>
  );
}
