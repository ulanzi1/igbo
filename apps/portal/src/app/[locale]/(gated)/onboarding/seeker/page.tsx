import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { auth } from "@igbo/auth";
import { getSeekerProfileByUserId } from "@igbo/db/queries/portal-seeker-profiles";
import { getSeekerPreferencesByProfileId } from "@igbo/db/queries/portal-seeker-preferences";
import { listSeekerCvs } from "@igbo/db/queries/portal-seeker-cvs";
import { getCommunityProfileForPrefill } from "@igbo/db/queries/cross-app";
import { SeekerOnboardingFlow } from "@/components/flow/seeker-onboarding-flow";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function SeekerOnboardingPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();

  // Only JOB_SEEKER role can access seeker onboarding
  if (!session?.user || session.user.activePortalRole !== "JOB_SEEKER") {
    redirect(`/${locale}`);
  }

  const profile = await getSeekerProfileByUserId(session.user.id);

  // Already fully onboarded — redirect to home
  if (profile?.onboardingCompletedAt) {
    redirect(`/${locale}`);
  }

  // Determine initial step:
  // - No profile → Step 1 (create profile)
  // - Profile exists but onboarding incomplete → Step 2 (preferences & CV)
  const initialStep = profile ? 2 : 1;

  let prefill = null;
  let initialPreferences = null;
  let initialCvs: Awaited<ReturnType<typeof listSeekerCvs>> = [];

  if (initialStep === 1) {
    prefill = await getCommunityProfileForPrefill(session.user.id);
  } else if (initialStep === 2 && profile) {
    initialPreferences = await getSeekerPreferencesByProfileId(profile.id);
    initialCvs = await listSeekerCvs(profile.id);
  }

  return (
    <div className="py-8">
      <SeekerOnboardingFlow
        locale={locale}
        initialStep={initialStep as 1 | 2}
        seekerProfile={profile}
        prefill={prefill}
        initialPreferences={initialPreferences}
        initialCvs={initialCvs}
      />
    </div>
  );
}
