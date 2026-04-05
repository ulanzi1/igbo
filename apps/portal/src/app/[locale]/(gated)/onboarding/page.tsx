import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { auth } from "@igbo/auth";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
import { OnboardingFlow } from "@/components/flow/onboarding-flow";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function OnboardingPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();

  // Only EMPLOYER role can access onboarding
  if (!session?.user || session.user.activePortalRole !== "EMPLOYER") {
    redirect(`/${locale}`);
  }

  const profile = await getCompanyByOwnerId(session.user.id);

  // Already fully onboarded — redirect to home
  if (profile?.onboardingCompletedAt) {
    redirect(`/${locale}`);
  }

  // Determine initial step:
  // - No profile → Step 1 (create profile)
  // - Profile exists but onboarding incomplete → Step 2 (already have profile, skip to posting)
  const initialStep = profile ? 2 : 1;

  return (
    <div className="py-8">
      <OnboardingFlow
        initialStep={initialStep as 1 | 2}
        companyProfile={profile ?? undefined}
        locale={locale}
      />
    </div>
  );
}
