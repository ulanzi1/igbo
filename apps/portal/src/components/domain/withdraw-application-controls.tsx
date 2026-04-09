"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { WithdrawApplicationDialog } from "@/components/flow/withdraw-application-dialog";
import type { PortalApplicationStatus } from "@igbo/db/schema/portal-applications";

interface WithdrawApplicationControlsProps {
  applicationId: string;
  jobTitle: string;
  currentStatus: PortalApplicationStatus;
}

export function WithdrawApplicationControls({
  applicationId,
  jobTitle,
  currentStatus,
}: WithdrawApplicationControlsProps) {
  const t = useTranslations("Portal.applications.withdraw");
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const handleSuccess = () => {
    router.refresh();
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} data-testid="withdraw-trigger-button">
        {t("buttonLabel")}
      </Button>

      <WithdrawApplicationDialog
        applicationId={applicationId}
        jobTitle={jobTitle}
        currentStatus={currentStatus}
        open={open}
        onOpenChange={setOpen}
        onSuccess={handleSuccess}
      />
    </>
  );
}
