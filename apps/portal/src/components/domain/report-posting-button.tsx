"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReportPostingModal } from "./report-posting-modal";

interface ReportPostingButtonProps {
  postingId: string;
  postingTitle: string;
}

export function ReportPostingButton({ postingId, postingTitle }: ReportPostingButtonProps) {
  const t = useTranslations("Portal.report");
  const [open, setOpen] = useState(false);
  const [reported, setReported] = useState(false);

  const handleSuccess = () => {
    setReported(true);
  };

  if (reported) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="report-submitted-message">
        {t("reportSubmitted")}
      </p>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="text-muted-foreground"
        onClick={() => setOpen(true)}
        data-testid="report-posting-button"
        aria-label={t("reportAriaLabel", { title: postingTitle })}
      >
        <Flag className="mr-1 h-3 w-3" aria-hidden="true" />
        {t("reportPosting")}
      </Button>

      <ReportPostingModal
        postingId={postingId}
        postingTitle={postingTitle}
        open={open}
        onOpenChange={setOpen}
        onSuccess={handleSuccess}
      />
    </>
  );
}
