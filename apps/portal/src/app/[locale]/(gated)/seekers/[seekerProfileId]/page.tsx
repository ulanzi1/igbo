import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@igbo/auth";
import { getSeekerProfileById } from "@igbo/db/queries/portal-seeker-profiles";
import { getSeekerTrustSignals } from "@igbo/db/queries/cross-app";
import { SeekerProfileView } from "@/components/domain/seeker-profile-view";
import { TrustSignalsPanel } from "@/components/semantic/trust-signals-panel";
import { SeekerProfileViewTracker } from "@/components/domain/seeker-profile-view-tracker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PageProps {
  params: Promise<{ locale: string; seekerProfileId: string }>;
}

export default async function SeekerProfilePage({ params }: PageProps) {
  const { seekerProfileId } = await params;
  const t = await getTranslations("Portal.seeker");

  const session = await auth();
  if (!session?.user || !["EMPLOYER", "JOB_ADMIN"].includes(session.user.activePortalRole ?? "")) {
    notFound();
  }

  const profile = await getSeekerProfileById(seekerProfileId);
  if (!profile) {
    notFound();
  }

  const signals = await getSeekerTrustSignals(profile.userId);

  return (
    <div className="max-w-2xl py-8">
      <Card>
        <CardHeader>
          <CardTitle>{t("publicViewHeading")}</CardTitle>
        </CardHeader>
        <CardContent>
          <SeekerProfileView profile={profile} editable={false} />
          {signals && <TrustSignalsPanel signals={signals} />}
        </CardContent>
      </Card>
      <SeekerProfileViewTracker
        seekerProfileId={seekerProfileId}
        viewerUserId={session.user.id}
        profileOwnerUserId={profile.userId}
      />
    </div>
  );
}
