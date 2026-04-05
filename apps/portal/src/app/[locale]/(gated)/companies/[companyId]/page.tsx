import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCompanyById } from "@igbo/db/queries/portal-companies";
import { getCommunityTrustSignals } from "@igbo/db/queries/cross-app";
import { TrustBadge } from "@/components/semantic/trust-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const revalidate = 60;

interface PageProps {
  params: Promise<{ locale: string; companyId: string }>;
}

export default async function CompanyDetailPage({ params }: PageProps) {
  const { companyId } = await params;
  const t = await getTranslations("Portal.company");
  const tIndustries = await getTranslations("Portal.industries");

  const profile = await getCompanyById(companyId);
  if (!profile) {
    notFound();
  }

  const trustSignals = await getCommunityTrustSignals(profile.ownerUserId);

  return (
    <div className="max-w-3xl py-8">
      <Card>
        <CardHeader>
          <div className="flex items-start gap-4">
            {profile.logoUrl && (
              <img
                src={profile.logoUrl}
                alt={`${profile.name} logo`}
                className="h-20 w-20 rounded-lg object-cover"
              />
            )}
            <div className="flex flex-col gap-1">
              <CardTitle>{profile.name}</CardTitle>
              {profile.industry && (
                <p className="text-sm text-muted-foreground">{tIndustries(profile.industry)}</p>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {profile.description && <p className="text-sm">{profile.description}</p>}

          {profile.companySize && (
            <div className="text-sm">
              <span className="font-medium">{t("companySize")}: </span>
              {profile.companySize}
            </div>
          )}

          {profile.cultureInfo && (
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">{t("cultureInfo")}</span>
              <p className="text-sm text-muted-foreground">{profile.cultureInfo}</p>
            </div>
          )}

          {/* Community trust signals */}
          {trustSignals && (
            <div className="border-t pt-4">
              <TrustBadge trustSignals={trustSignals} />
            </div>
          )}

          {/* Active job postings stub */}
          <div className="border-t pt-4">
            <h2 className="mb-2 text-sm font-semibold">{t("activeJobs")}</h2>
            <p className="text-sm text-muted-foreground">{t("noJobsYet")}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
