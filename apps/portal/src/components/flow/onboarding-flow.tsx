"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { OnboardingStepIndicator } from "@/components/domain/onboarding-step-indicator";
import { CompanyProfileForm } from "@/components/flow/company-profile-form";
import type { PortalCompanyProfile } from "@igbo/db/schema/portal-company-profiles";

interface OnboardingFlowProps {
  initialStep: 1 | 2 | 3;
  companyProfile?: PortalCompanyProfile;
  locale: string;
}

export function OnboardingFlow({ initialStep, companyProfile, locale }: OnboardingFlowProps) {
  const t = useTranslations("Portal.onboarding");
  const router = useRouter();

  const [currentStep, setCurrentStep] = React.useState<1 | 2 | 3>(initialStep);
  const [completedSteps, setCompletedSteps] = React.useState<number[]>(() => {
    // If starting at step 2, step 1 is implicitly done
    if (initialStep === 2) return [1];
    if (initialStep === 3) return [1, 2];
    return [];
  });
  const [createdProfile, setCreatedProfile] = React.useState<PortalCompanyProfile | null>(
    companyProfile ?? null,
  );
  const [isCompleting, setIsCompleting] = React.useState(false);

  function advanceTo(step: 1 | 2 | 3, justCompleted?: number) {
    if (justCompleted !== undefined) {
      setCompletedSteps((prev) => (prev.includes(justCompleted) ? prev : [...prev, justCompleted]));
    }
    setCurrentStep(step);
  }

  async function handleComplete() {
    setIsCompleting(true);
    try {
      const res = await fetch("/api/v1/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        toast.error(errBody.detail ?? "Failed to complete onboarding");
        return;
      }
      router.push(`/${locale}`);
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsCompleting(false);
    }
  }

  return (
    <div className="container max-w-2xl py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground mb-1">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="mb-8">
        <OnboardingStepIndicator currentStep={currentStep} completedSteps={completedSteps} />
      </div>

      {currentStep === 1 && (
        <section aria-labelledby="step1-heading">
          <h2 id="step1-heading" className="text-xl font-semibold mb-2">
            {t("step1Title")}
          </h2>
          <p className="text-muted-foreground mb-6">{t("step1Description")}</p>
          <CompanyProfileForm
            mode="create"
            onSuccess={(profile) => {
              setCreatedProfile(profile);
              advanceTo(2, 1);
            }}
          />
        </section>
      )}

      {currentStep === 2 && (
        <section aria-labelledby="step2-heading">
          <h2 id="step2-heading" className="text-xl font-semibold mb-2">
            {t("step2Title")}
          </h2>
          <p className="text-muted-foreground mb-6">{t("step2Description")}</p>
          <div className="flex flex-col gap-4">
            <Link
              href={`/${locale}/jobs/new?from=onboarding`}
              className="inline-flex items-center justify-center min-h-[44px] px-6 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              {t("createJobPosting")}
            </Link>
            <Button variant="outline" onClick={() => advanceTo(3, 2)}>
              {t("skipForNow")}
            </Button>
          </div>
        </section>
      )}

      {currentStep === 3 && (
        <section aria-labelledby="step3-heading">
          <h2 id="step3-heading" className="text-xl font-semibold mb-2">
            {t("summaryTitle")}
          </h2>
          <p className="text-muted-foreground mb-6">{t("step3Description")}</p>

          <ul className="mb-6 space-y-2 text-sm">
            {createdProfile && (
              <li className="flex items-center gap-2">
                <span aria-hidden="true">✓</span>
                {t("summaryProfile", { name: createdProfile.name })}
              </li>
            )}
            <li className="flex items-center gap-2 text-muted-foreground">
              <span aria-hidden="true">ℹ</span>
              {t("summaryNoPosting")}
            </li>
          </ul>

          <div className="flex flex-col gap-3 mb-6">
            {createdProfile && (
              <Link href={`/${locale}/company-profile`} className="text-sm text-primary underline">
                {t("editProfile")}
              </Link>
            )}
            <Link href={`/${locale}/jobs/new`} className="text-sm text-primary underline">
              {t("createPosting")}
            </Link>
          </div>

          <Button onClick={handleComplete} disabled={isCompleting}>
            {isCompleting ? "..." : t("complete")}
          </Button>
        </section>
      )}
    </div>
  );
}

export function OnboardingFlowSkeleton() {
  return (
    <div className="container max-w-2xl py-8">
      <div className="mb-8">
        <div className="h-8 w-64 animate-pulse rounded bg-muted mb-2" />
        <div className="h-4 w-48 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-10 w-full animate-pulse rounded bg-muted mb-8" />
      <div className="space-y-4">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="h-11 w-full animate-pulse rounded bg-muted" />
        ))}
      </div>
    </div>
  );
}
