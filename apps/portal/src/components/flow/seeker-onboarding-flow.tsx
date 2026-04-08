"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OnboardingStepIndicator } from "@/components/domain/onboarding-step-indicator";
import { SeekerProfileForm } from "@/components/flow/seeker-profile-form";
import { SeekerPreferencesSection } from "@/components/flow/seeker-preferences-section";
import { SeekerCvManager } from "@/components/flow/seeker-cv-manager";
import type { PortalSeekerProfile } from "@igbo/db/schema/portal-seeker-profiles";
import type { PortalSeekerPreferences } from "@igbo/db/schema/portal-seeker-preferences";
import type { CvWithFile } from "@igbo/db/queries/portal-seeker-cvs";

interface SeekerOnboardingFlowProps {
  locale: string;
  initialStep: 1 | 2;
  seekerProfile: PortalSeekerProfile | null;
  prefill?: { displayName?: string | null; bio?: string | null } | null;
  initialPreferences?: PortalSeekerPreferences | null;
  initialCvs?: CvWithFile[];
}

export function SeekerOnboardingFlow({
  locale,
  initialStep,
  seekerProfile,
  prefill,
  initialPreferences,
  initialCvs = [],
}: SeekerOnboardingFlowProps) {
  const t = useTranslations("Portal.seekerOnboarding");
  const router = useRouter();

  const [currentStep, setCurrentStep] = React.useState<1 | 2 | 3>(initialStep);
  const [completedSteps, setCompletedSteps] = React.useState<number[]>(() => {
    if (initialStep === 2) return [1];
    return [];
  });
  const [, setCreatedProfile] = React.useState<PortalSeekerProfile | null>(seekerProfile ?? null);
  const [preferencesCompleted, setPreferencesCompleted] = React.useState(false);
  const [cvUploaded, setCvUploaded] = React.useState(false);
  const [isCompleting, setIsCompleting] = React.useState(false);

  // Refs for focus management on step transitions
  const step2HeadingRef = React.useRef<HTMLHeadingElement>(null);
  const step3HeadingRef = React.useRef<HTMLHeadingElement>(null);

  function advanceTo(step: 1 | 2 | 3, justCompleted?: number) {
    if (justCompleted !== undefined) {
      setCompletedSteps((prev) => (prev.includes(justCompleted) ? prev : [...prev, justCompleted]));
    }
    setCurrentStep(step);
  }

  // Focus the new step heading after the DOM has committed (post-render).
  // useEffect is more reliable than setTimeout under React 19 concurrent rendering.
  React.useEffect(() => {
    if (currentStep === 2) step2HeadingRef.current?.focus();
    if (currentStep === 3) step3HeadingRef.current?.focus();
  }, [currentStep]);

  async function handleComplete() {
    setIsCompleting(true);
    try {
      const res = await fetch("/api/v1/seekers/me/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        toast.error((errBody as { detail?: string }).detail ?? t("completeError"));
        return;
      }
      router.push(`/${locale}`);
    } catch {
      toast.error(t("unexpectedError"));
    } finally {
      setIsCompleting(false);
    }
  }

  const stepTitles = [t("step1Title"), t("step2Title"), t("step3Title")];

  return (
    <div className="container max-w-2xl py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground mb-1">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="mb-8">
        <OnboardingStepIndicator
          currentStep={currentStep}
          completedSteps={completedSteps}
          stepTitles={stepTitles}
        />
      </div>

      {currentStep === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 id="seeker-step1-heading" className="text-xl">
                {t("step1Title")}
              </h2>
            </CardTitle>
            <CardDescription>{t("step1Description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <SeekerProfileForm
              mode="create"
              prefill={
                prefill
                  ? {
                      displayName: prefill.displayName ?? null,
                      bio: prefill.bio ?? null,
                    }
                  : undefined
              }
              onSuccess={(p) => {
                setCreatedProfile(p as PortalSeekerProfile);
                advanceTo(2, 1);
              }}
              onCancel={() => router.push(`/${locale}`)}
            />
          </CardContent>
        </Card>
      )}

      {currentStep === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2
                id="seeker-step2-heading"
                ref={step2HeadingRef}
                tabIndex={-1}
                className="text-xl focus:outline-none"
              >
                {t("step2Title")}
              </h2>
            </CardTitle>
            <CardDescription>{t("step2Description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <SeekerPreferencesSection
              initialPrefs={initialPreferences}
              onSave={() => setPreferencesCompleted(true)}
            />

            <div className="mt-6">
              <SeekerCvManager
                initialCvs={initialCvs}
                onUploadSuccess={() => setCvUploaded(true)}
              />
            </div>

            <div className="mt-6 flex justify-end">
              <Button variant="ghost" aria-label={t("skipForNow")} onClick={() => advanceTo(3, 2)}>
                {t("skipForNow")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {currentStep === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2
                id="seeker-step3-heading"
                ref={step3HeadingRef}
                tabIndex={-1}
                className="text-xl focus:outline-none"
              >
                {t("summaryTitle")}
              </h2>
            </CardTitle>
            <CardDescription>{t("step3Description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="mb-6 space-y-3 text-sm">
              <li className="flex items-center gap-2">
                <span aria-hidden="true">✓</span>
                {t("summaryProfileCreated")}
              </li>
              {preferencesCompleted ? (
                <li className="flex items-center gap-2">
                  <span aria-hidden="true">✓</span>
                  {t("summaryPreferencesSet")}
                </li>
              ) : (
                <li className="flex items-center gap-2 text-muted-foreground">
                  <span aria-hidden="true">ℹ</span>
                  {t("summaryPreferencesSkipped")}
                </li>
              )}
              {cvUploaded ? (
                <li className="flex items-center gap-2">
                  <span aria-hidden="true">✓</span>
                  {t("summaryCvUploaded")}
                </li>
              ) : (
                <li className="flex items-center gap-2 text-muted-foreground">
                  <span aria-hidden="true">ℹ</span>
                  {t("summaryCvSkipped")}
                </li>
              )}
            </ul>

            <div className="flex flex-col gap-2 mb-6 text-sm">
              <Link href={`/${locale}/jobs`} className="text-primary underline">
                {t("browseJobs")}
              </Link>
              <Link href={`/${locale}/profile?edit=true`} className="text-primary underline">
                {t("editProfile")}
              </Link>
              <Link href={`/${locale}/profile`} className="text-primary underline">
                {t("updatePreferences")}
              </Link>
            </div>

            <Button onClick={handleComplete} disabled={isCompleting} aria-busy={isCompleting}>
              {isCompleting ? t("completing") : t("getStarted")}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function SeekerOnboardingFlowSkeleton() {
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
