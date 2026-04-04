import { getTranslations } from "next-intl/server";
import { requireCompanyProfile } from "@/lib/require-company-profile";
import { JobPostingForm } from "@/components/flow/job-posting-form";
import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function NewJobPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations("Portal.posting");

  const profile = await requireCompanyProfile(locale);
  if (!profile) {
    redirect(`/${locale}`);
  }

  return (
    <main id="main-content" className="container max-w-2xl py-8">
      <h1 className="mb-6 text-2xl font-bold">{t("createTitle")}</h1>
      <JobPostingForm companyId={profile.id} />
    </main>
  );
}
