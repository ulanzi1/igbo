import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { auth } from "@igbo/auth";
import { getTranslations } from "next-intl/server";
import { listPendingVerifications } from "@igbo/db/queries/portal-employer-verifications";
import { VerificationQueueTable } from "@/components/domain/verification-queue-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function AdminVerificationsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user || session.user.activePortalRole !== "JOB_ADMIN") {
    redirect(`/${locale}`);
    return null;
  }

  const t = await getTranslations("Portal.admin");

  const { items } = await listPendingVerifications({ limit: 50, offset: 0 });

  return (
    <main className="container mx-auto max-w-5xl px-4 py-8" data-testid="verifications-page">
      <Card>
        <CardHeader>
          <CardTitle>{t("verificationsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <VerificationQueueTable items={items} />
        </CardContent>
      </Card>
    </main>
  );
}
