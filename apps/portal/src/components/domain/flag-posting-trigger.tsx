"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FlagPostingModal } from "./flag-posting-modal";

interface FlagPostingTriggerProps {
  postingId: string;
  postingTitle: string;
  postingStatus: string;
}

export function FlagPostingTrigger({
  postingId,
  postingTitle,
  postingStatus,
}: FlagPostingTriggerProps) {
  const t = useTranslations("Portal.admin");
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Only active postings can be flagged
  if (postingStatus !== "active") return null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        data-testid="flag-violation-button"
        aria-label={t("flagForViolation")}
      >
        {t("flagForViolation")}
      </Button>

      <FlagPostingModal
        postingId={postingId}
        postingTitle={postingTitle}
        open={open}
        onOpenChange={setOpen}
        onSuccess={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}
