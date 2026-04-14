import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@igbo/auth";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { VerificationForm } from "@/components/domain/verification-form";
import { Separator } from "@/components/ui/separator";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function VerificationPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations("Portal.verification");

  const session = await auth();
  if (!session?.user || session.user.activePortalRole !== "EMPLOYER") {
    redirect(`/${locale}`);
  }

  const profile = await getCompanyByOwnerId(session.user.id);
  if (!profile) {
    redirect(`/${locale}/company-profile`);
  }

  return (
    <div className="max-w-2xl py-8">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {/* Instructions */}
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="text-sm font-medium">{t("requiredDocuments")}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("requiredDocumentsDescription")}
              </p>
            </div>
            <Separator />
            <div>
              <h3 className="text-sm font-medium">{t("benefits")}</h3>
              <ul className="mt-1 flex flex-col gap-1 text-sm text-muted-foreground list-disc list-inside">
                <li>{t("benefitTrustBadge")}</li>
                <li>{t("benefitFastLane")}</li>
                <li>{t("benefitRankingBoost")}</li>
              </ul>
            </div>
            <Separator />
          </div>

          {/* Upload form */}
          <div>
            <h3 className="mb-3 text-sm font-medium">{t("uploadDocuments")}</h3>
            <VerificationForm companyId={profile.id} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
