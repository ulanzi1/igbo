"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { ProfileStep, GuidelinesStep, TourStep } from "@/features/profiles";
import type { OnboardingStep } from "@/services/onboarding-service";

type WizardStep = Exclude<OnboardingStep, "complete">;

const STEP_ORDER: WizardStep[] = ["profile", "guidelines", "tour"];

interface Props {
  initialStep: WizardStep;
  defaultDisplayName: string;
  defaultLocationCity: string;
  defaultLocationState: string;
  defaultLocationCountry: string;
  guidelinesHtml: string;
}

export function OnboardingWizard({
  initialStep,
  defaultDisplayName,
  defaultLocationCity,
  defaultLocationState,
  defaultLocationCountry,
  guidelinesHtml,
}: Props) {
  const t = useTranslations("Onboarding");
  const queryClient = useQueryClient();

  const [currentStep, setCurrentStep] = useState<WizardStep>(initialStep);

  const stepIndex = STEP_ORDER.indexOf(currentStep);

  function advance() {
    const next = STEP_ORDER[stepIndex + 1];
    if (next) {
      setCurrentStep(next);
      // Invalidate onboarding state query so any re-load reflects progress
      void queryClient.invalidateQueries({ queryKey: ["onboarding-state"] });
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      {/* Step progress */}
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
        {t("stepProgress", { step: stepIndex + 1, total: STEP_ORDER.length })}
      </p>

      {/* Step tabs */}
      <div className="mb-6 flex border-b border-gray-200">
        {STEP_ORDER.map((step, i) => (
          <div
            key={step}
            className={`flex-1 py-2 text-center text-sm font-medium ${
              i < stepIndex
                ? "text-indigo-600"
                : i === stepIndex
                  ? "border-b-2 border-indigo-600 text-indigo-600"
                  : "text-gray-400"
            }`}
          >
            {t(`steps.${step}`)}
          </div>
        ))}
      </div>

      {/* Step content */}
      {currentStep === "profile" && (
        <ProfileStep
          defaultDisplayName={defaultDisplayName}
          defaultLocationCity={defaultLocationCity}
          defaultLocationState={defaultLocationState}
          defaultLocationCountry={defaultLocationCountry}
          onComplete={advance}
        />
      )}
      {currentStep === "guidelines" && (
        <GuidelinesStep guidelinesHtml={guidelinesHtml} onComplete={advance} />
      )}
      {currentStep === "tour" && <TourStep />}
    </div>
  );
}
