"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type StepKey =
  | "basicInfo"
  | "location"
  | "culturalConnection"
  | "reasonForJoining"
  | "consentAndReferral";

const STEP_KEYS: StepKey[] = [
  "basicInfo",
  "location",
  "culturalConnection",
  "reasonForJoining",
  "consentAndReferral",
];

interface ApplicationStepperProps {
  currentStep: number; // 1-indexed
}

export function ApplicationStepper({ currentStep }: ApplicationStepperProps) {
  const t = useTranslations("Apply");
  const total = STEP_KEYS.length;

  return (
    <nav aria-label={t("stepProgress", { step: currentStep, total })}>
      <ol className="flex items-center justify-center gap-1 mb-8" aria-label="Application progress">
        {STEP_KEYS.map((key, idx) => {
          const stepNum = idx + 1;
          const isCurrent = stepNum === currentStep;
          const isComplete = stepNum < currentStep;
          const stepLabel = t(`stepLabels.${key}` as `stepLabels.${StepKey}`);

          let ariaLabel: string;
          if (isComplete) {
            ariaLabel = `Step ${stepNum} of ${total}: ${stepLabel} (completed)`;
          } else if (isCurrent) {
            ariaLabel = `Step ${stepNum} of ${total}: ${stepLabel} (current)`;
          } else {
            ariaLabel = `Step ${stepNum} of ${total}: ${stepLabel} (incomplete)`;
          }

          return (
            <li
              key={key}
              aria-current={isCurrent ? "step" : undefined}
              aria-label={ariaLabel}
              className="flex flex-col items-center"
            >
              <div className="flex items-center">
                <div
                  className={cn(
                    "size-3 rounded-full transition-colors",
                    isComplete && "bg-primary",
                    isCurrent && "bg-primary ring-2 ring-primary ring-offset-2",
                    !isComplete && !isCurrent && "bg-muted-foreground/30",
                  )}
                  aria-hidden="true"
                />
                {idx < STEP_KEYS.length - 1 && (
                  <div
                    className={cn(
                      "h-px w-8 mx-1 transition-colors",
                      stepNum < currentStep ? "bg-primary" : "bg-muted-foreground/30",
                    )}
                    aria-hidden="true"
                  />
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <p
        role="status"
        aria-live="polite"
        className="text-center text-sm text-muted-foreground mb-6"
      >
        {t("stepProgress", { step: currentStep, total })}
      </p>
    </nav>
  );
}
