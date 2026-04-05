import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@igbo/auth";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
import { CompanyProfileForm } from "@/components/flow/company-profile-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ edit?: string; onboarding?: string }>;
}

export default async function CompanyProfilePage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { edit, onboarding } = await searchParams;
  const t = await getTranslations("Portal.company");
  const tIndustries = await getTranslations("Portal.industries");

  const session = await auth();
  if (!session?.user || session.user.activePortalRole !== "EMPLOYER") {
    redirect(`/${locale}`);
  }

  const profile = await getCompanyByOwnerId(session.user.id);

  const isCreateMode = !profile;
  const isEditMode = !!profile && edit === "true";

  if (isCreateMode) {
    return (
      <div className="max-w-2xl py-8">
        <Card>
          <CardHeader>
            <CardTitle>{t("createTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <CompanyProfileForm mode="create" showOnboardingToast={onboarding === "true"} />
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
            <CardTitle>{t("editTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <CompanyProfileForm mode="edit" initialData={profile} />
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
          <div className="flex items-start justify-between">
            <CardTitle>{profile.name}</CardTitle>
            <Button asChild variant="outline" size="sm">
              <Link href={`/${locale}/company-profile?edit=true`}>{t("edit")}</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {profile.logoUrl && (
            <img
              src={profile.logoUrl}
              alt={`${profile.name} logo`}
              className="h-24 w-24 rounded-lg object-cover"
            />
          )}
          {profile.description && <p className="text-sm">{profile.description}</p>}
          {profile.industry && (
            <div className="text-sm">
              <span className="font-medium">{t("industry")}: </span>
              {tIndustries(profile.industry)}
            </div>
          )}
          {profile.companySize && (
            <div className="text-sm">
              <span className="font-medium">{t("companySize")}: </span>
              {profile.companySize}
            </div>
          )}
          {profile.cultureInfo && (
            <div className="text-sm">
              <span className="font-medium">{t("cultureInfo")}: </span>
              {profile.cultureInfo}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
