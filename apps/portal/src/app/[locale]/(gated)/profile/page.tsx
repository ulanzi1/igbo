import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@igbo/auth";
import { getSeekerProfileByUserId } from "@igbo/db/queries/portal-seeker-profiles";
import { getCommunityProfileForPrefill } from "@igbo/db/queries/cross-app";
import { getSeekerPreferencesByProfileId } from "@igbo/db/queries/portal-seeker-preferences";
import { listSeekerCvs } from "@igbo/db/queries/portal-seeker-cvs";
import { SeekerProfileForm } from "@/components/flow/seeker-profile-form";
import { SeekerProfileView } from "@/components/domain/seeker-profile-view";
import { SeekerPreferencesSection } from "@/components/flow/seeker-preferences-section";
import { SeekerCvManager } from "@/components/flow/seeker-cv-manager";
import { SeekerVisibilitySection } from "@/components/flow/seeker-visibility-section";
import { SeekerConsentSection } from "@/components/flow/seeker-consent-section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ edit?: string }>;
}

export default async function ProfilePage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { edit } = await searchParams;
  const t = await getTranslations("Portal.seeker");

  const session = await auth();
  if (!session?.user || session.user.activePortalRole !== "JOB_SEEKER") {
    redirect(`/${locale}`);
  }

  const profile = await getSeekerProfileByUserId(session.user.id);

  const isCreateMode = !profile;
  const isEditMode = !!profile && edit === "true";

  if (isCreateMode) {
    const prefill = await getCommunityProfileForPrefill(session.user.id);
    return (
      <div className="max-w-2xl py-8">
        <Card>
          <CardHeader>
            <CardTitle>{t("pageTitleCreate")}</CardTitle>
          </CardHeader>
          <CardContent>
            <SeekerProfileForm mode="create" prefill={prefill} />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Fetch supplementary data for both view and edit modes (sections manage their own save state)
  const [prefs, cvs] = await Promise.all([
    getSeekerPreferencesByProfileId(profile.id),
    listSeekerCvs(profile.id),
  ]);

  const supplementarySections = (
    <>
      <Card>
        <CardContent className="pt-6">
          <SeekerPreferencesSection initialPrefs={prefs} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <SeekerCvManager initialCvs={cvs} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <SeekerVisibilitySection
            initialVisibility={profile.visibility as "active" | "passive" | "hidden"}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <SeekerConsentSection
            initialConsentMatching={profile.consentMatching}
            initialConsentEmployerView={profile.consentEmployerView}
            matchingChangedAt={profile.consentMatchingChangedAt?.toISOString() ?? null}
            employerViewChangedAt={profile.consentEmployerViewChangedAt?.toISOString() ?? null}
          />
        </CardContent>
      </Card>
    </>
  );

  if (isEditMode) {
    return (
      <div className="max-w-2xl py-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("pageTitleEdit")}</CardTitle>
          </CardHeader>
          <CardContent>
            <SeekerProfileForm mode="edit" initialData={profile} />
          </CardContent>
        </Card>
        {supplementarySections}
      </div>
    );
  }

  return (
    <div className="max-w-2xl py-8 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("pageTitleView")}</CardTitle>
        </CardHeader>
        <CardContent>
          <SeekerProfileView profile={profile} editable />
        </CardContent>
      </Card>
      {supplementarySections}
    </div>
  );
}
