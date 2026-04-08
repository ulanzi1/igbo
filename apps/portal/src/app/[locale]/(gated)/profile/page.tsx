import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@igbo/auth";
import { getSeekerProfileByUserId } from "@igbo/db/queries/portal-seeker-profiles";
import { getCommunityProfileForPrefill } from "@igbo/db/queries/cross-app";
import { SeekerProfileForm } from "@/components/flow/seeker-profile-form";
import { SeekerProfileView } from "@/components/domain/seeker-profile-view";
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

  if (isEditMode) {
    return (
      <div className="max-w-2xl py-8">
        <Card>
          <CardHeader>
            <CardTitle>{t("pageTitleEdit")}</CardTitle>
          </CardHeader>
          <CardContent>
            <SeekerProfileForm mode="edit" initialData={profile} />
          </CardContent>
        </Card>
      </div>
    );
  }

  // View mode
  return (
    <div className="max-w-2xl py-8">
      <Card>
        <CardHeader>
          <CardTitle>{t("pageTitleView")}</CardTitle>
        </CardHeader>
        <CardContent>
          <SeekerProfileView profile={profile} editable />
        </CardContent>
      </Card>
    </div>
  );
}
