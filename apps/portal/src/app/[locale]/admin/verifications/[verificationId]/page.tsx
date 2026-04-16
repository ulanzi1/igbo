import { setRequestLocale } from "next-intl/server";
import { redirect, notFound } from "next/navigation";
import { auth } from "@igbo/auth";
import { getTranslations } from "next-intl/server";
import {
  getVerificationById,
  getVerificationHistoryForCompany,
} from "@igbo/db/queries/portal-employer-verifications";
import type { PortalEmployerVerification } from "@igbo/db/schema/portal-employer-verifications";
import { countOpenViolationsForCompany } from "@igbo/db/queries/portal-admin-flags";
import { getCompanyById } from "@igbo/db/queries/portal-companies";
import { findUserById } from "@igbo/db/queries/auth-queries";
import { VerificationReviewDetail } from "@/components/domain/verification-review-detail";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

interface PageProps {
  params: Promise<{ locale: string; verificationId: string }>;
}

export default async function AdminVerificationDetailPage({ params }: PageProps) {
  const { locale, verificationId } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user || session.user.activePortalRole !== "JOB_ADMIN") {
    redirect(`/${locale}`);
    return null;
  }

  const [t, verification] = await Promise.all([
    getTranslations("Portal.admin"),
    getVerificationById(verificationId),
  ]);

  if (!verification) {
    notFound();
    return null;
  }

  const [history, openViolationCount, company, owner] = await Promise.all([
    getVerificationHistoryForCompany(verification.companyId),
    countOpenViolationsForCompany(verification.companyId),
    getCompanyById(verification.companyId),
    findUserById("")
      .then(() => null)
      .catch(() => null), // placeholder — we get name from company
  ]);

  void owner; // will use company data for display

  const companyName = company?.name ?? "Unknown Company";
  // For the owner name, we'd ideally join auth_users but for now use company name as placeholder
  const ownerUserName = company?.ownerUserId
    ? await findUserById(company.ownerUserId).then((u) => u?.name ?? u?.email ?? "Unknown")
    : "Unknown";

  const enrichedVerification = {
    ...verification,
    history: history.filter((h: PortalEmployerVerification) => h.id !== verification.id),
    openViolationCount,
    companyName,
    ownerUserName,
  };

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8" data-testid="verification-detail-page">
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/${locale}/admin/verifications`}>{t("backToQueue")}</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("verificationDetail")}</CardTitle>
          <CardDescription>{t("verificationDetailDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <VerificationReviewDetail verification={enrichedVerification} />
        </CardContent>
      </Card>
    </main>
  );
}
