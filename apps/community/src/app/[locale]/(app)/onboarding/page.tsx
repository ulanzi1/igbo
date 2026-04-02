import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { auth } from "@/server/auth/config";
import { getOnboardingState } from "@/services/onboarding-service";
import { findUserById } from "@igbo/db/queries/auth-queries";
import { renderMarkdown } from "@/lib/render-markdown";
import { OnboardingWizard } from "@/features/profiles";
import { redirect } from "@/i18n/navigation";
import type { OnboardingStep } from "@/services/onboarding-service";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Onboarding" });
  return { title: t("pageTitle") };
}

export default async function OnboardingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const { locale } = await params;
  const { step: stepParam } = await searchParams;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user?.id) {
    redirect({ href: "/login", locale });
    return null;
  }

  const [onboardingState, user] = await Promise.all([
    getOnboardingState(session.user.id),
    findUserById(session.user.id),
  ]);

  // If already complete and not explicitly retaking the tour, redirect to dashboard
  if (onboardingState.step === "complete" && stepParam !== "tour") {
    redirect({ href: "/dashboard", locale });
    return null;
  }

  // Determine the step to render: honour ?step= param only if it's a valid step
  // that hasn't been bypassed (only allow going forward from completed steps).
  const VALID_STEPS: OnboardingStep[] = ["profile", "guidelines", "tour"];
  const requestedStep =
    stepParam && VALID_STEPS.includes(stepParam as OnboardingStep)
      ? (stepParam as OnboardingStep)
      : null;

  // Allow tour retake for completed users
  if (onboardingState.step === "complete" && requestedStep === "tour") {
    return (
      <main className="min-h-screen bg-white">
        <OnboardingWizard
          initialStep="tour"
          defaultDisplayName=""
          defaultLocationCity=""
          defaultLocationState=""
          defaultLocationCountry=""
          guidelinesHtml=""
        />
      </main>
    );
  }

  // Map completed steps: allow jumping to any step at or after the current one
  const stepOrder: OnboardingStep[] = ["profile", "guidelines", "tour"];
  const currentStepIndex = stepOrder.indexOf(onboardingState.step);
  const requestedStepIndex = requestedStep ? stepOrder.indexOf(requestedStep) : -1;

  const initialStep: Exclude<OnboardingStep, "complete"> =
    requestedStepIndex >= currentStepIndex && requestedStep !== "complete"
      ? (requestedStep as Exclude<OnboardingStep, "complete">)
      : (onboardingState.step as Exclude<OnboardingStep, "complete">);

  // Load guidelines content server-side and sanitize
  const guidelinesLocale = locale === "ig" ? "ig" : "en";
  let guidelinesHtml = "";
  try {
    const mdPath = join(process.cwd(), "src", "content", "guidelines", `${guidelinesLocale}.md`);
    const raw = await readFile(mdPath, "utf-8");
    guidelinesHtml = renderMarkdown(raw);
  } catch {
    // Fallback to empty — guidelines step will show empty content
    guidelinesHtml = "";
  }

  // Pre-fill defaults from auth_users
  const defaultDisplayName = user?.name ?? "";
  const defaultLocationCity = user?.locationCity ?? "";
  const defaultLocationState = user?.locationState ?? "";
  const defaultLocationCountry = user?.locationCountry ?? "";

  return (
    <main className="min-h-screen bg-white">
      <OnboardingWizard
        initialStep={initialStep}
        defaultDisplayName={defaultDisplayName}
        defaultLocationCity={defaultLocationCity}
        defaultLocationState={defaultLocationState}
        defaultLocationCountry={defaultLocationCountry}
        guidelinesHtml={guidelinesHtml}
      />
    </main>
  );
}
