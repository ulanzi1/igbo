"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

interface OnboardingStepIndicatorProps {
  currentStep: 1 | 2 | 3;
  completedSteps: number[];
}

export function OnboardingStepIndicator({
  currentStep,
  completedSteps,
}: OnboardingStepIndicatorProps) {
  const t = useTranslations("Portal.onboarding");

  const steps: { key: 1 | 2 | 3; labelKey: string }[] = [
    { key: 1, labelKey: "step1Title" },
    { key: 2, labelKey: "step2Title" },
    { key: 3, labelKey: "step3Title" },
  ];

  return (
    <nav aria-label={t("stepOf", { current: currentStep, total: 3 })}>
      <div role="list" className="flex items-center gap-4">
        {steps.map((step, index) => {
          const isCompleted = completedSteps.includes(step.key);
          const isCurrent = step.key === currentStep;
          const isFuture = step.key > currentStep && !isCompleted;

          return (
            <React.Fragment key={step.key}>
              <div
                role="listitem"
                aria-current={isCurrent ? "step" : undefined}
                className={[
                  "flex items-center gap-2 text-sm font-medium",
                  isCurrent ? "text-primary" : "",
                  isCompleted ? "text-primary" : "",
                  isFuture ? "text-muted-foreground" : "",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-semibold",
                    isCurrent ? "border-primary bg-primary text-primary-foreground" : "",
                    isCompleted ? "border-primary bg-primary text-primary-foreground" : "",
                    isFuture ? "border-muted-foreground text-muted-foreground" : "",
                  ].join(" ")}
                  aria-hidden="true"
                >
                  {isCompleted ? "✓" : step.key}
                </span>
                <span className="hidden sm:inline">
                  {t(step.labelKey as Parameters<typeof t>[0])}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div aria-hidden="true" className="flex-1 border-t border-border" />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </nav>
  );
}

export function OnboardingStepIndicatorSkeleton() {
  return (
    <div className="flex items-center gap-4" aria-hidden="true">
      {[1, 2, 3].map((n) => (
        <React.Fragment key={n}>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 animate-pulse rounded-full bg-muted" />
            <div className="hidden h-4 w-24 animate-pulse rounded bg-muted sm:block" />
          </div>
          {n < 3 && <div className="flex-1 border-t border-muted" />}
        </React.Fragment>
      ))}
    </div>
  );
}
