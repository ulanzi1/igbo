"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ApplicationDrawer } from "@/components/flow/application-drawer";

export interface CvOption {
  id: string;
  label: string | null;
  isDefault: boolean;
  file: { originalFilename: string };
}

export interface ApplyButtonProps {
  jobId: string;
  jobTitle: string;
  companyName: string;
  hasProfile: boolean;
  hasExistingApplication: boolean;
  deadlinePassed: boolean;
  enableCoverLetter: boolean;
  profileHeadline: string | null;
  profileSkills: string[];
  profileLocation: string | null;
  locale: string;
}

export function ApplyButton({
  jobId,
  jobTitle,
  companyName,
  hasProfile,
  hasExistingApplication,
  deadlinePassed,
  enableCoverLetter,
  profileHeadline,
  profileSkills,
  profileLocation,
  locale,
}: ApplyButtonProps) {
  const t = useTranslations("Portal.apply");
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [cvs, setCvs] = useState<CvOption[]>([]);
  const [cvsLoading, setCvsLoading] = useState(false);
  const [applied, setApplied] = useState(hasExistingApplication);

  useEffect(() => {
    if (!open || !hasProfile) return;
    setCvsLoading(true);
    fetch("/api/v1/seekers/me/cvs")
      .then((res) => res.json())
      .then((data: { data?: CvOption[] }) => setCvs(data.data ?? []))
      .catch(() => setCvs([]))
      .finally(() => setCvsLoading(false));
  }, [open, hasProfile]);

  if (!hasProfile) {
    return (
      <Button
        variant="default"
        onClick={() =>
          router.push(`/${locale}/onboarding/seeker?returnTo=${encodeURIComponent(pathname)}`)
        }
      >
        {t("button.completeProfile")}
      </Button>
    );
  }

  if (applied) {
    return (
      <Button disabled aria-disabled="true">
        {t("button.submitted")}
      </Button>
    );
  }

  if (deadlinePassed) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0}>
              <Button disabled aria-disabled="true">
                {t("button.apply")}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{t("button.deadlinePassed")}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>{t("button.apply")}</Button>
      <ApplicationDrawer
        open={open}
        onOpenChange={(val: boolean) => {
          setOpen(val);
        }}
        jobId={jobId}
        jobTitle={jobTitle}
        companyName={companyName}
        cvs={cvs}
        cvsLoading={cvsLoading}
        profileHeadline={profileHeadline}
        profileSkills={profileSkills}
        profileLocation={profileLocation}
        enableCoverLetter={enableCoverLetter}
        onSuccess={() => {
          // Called when user closes the drawer from "confirmed" state (P-2.5B).
          // router.refresh() triggers here (on confirmed-close) rather than immediately on submit.
          setApplied(true);
          toast.success(t("toast.success"));
          router.refresh();
        }}
      />
    </>
  );
}
