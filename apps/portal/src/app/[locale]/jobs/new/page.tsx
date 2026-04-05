import { getTranslations } from "next-intl/server";
import { requireCompanyProfile } from "@/lib/require-company-profile";
import { JobPostingForm } from "@/components/flow/job-posting-form";
import { redirect } from "next/navigation";
import Link from "next/link";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ from?: string }>;
}

export default async function NewJobPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const resolvedSearchParams = await (searchParams ?? Promise.resolve({} as { from?: string }));
  const fromOnboarding = resolvedSearchParams.from === "onboarding";

  const t = await getTranslations("Portal.posting");
  const tOnboarding = await getTranslations("Portal.onboarding");

  const profile = await requireCompanyProfile(locale);
  if (!profile) {
    redirect(`/${locale}`);
  }

  return (
    <main id="main-content" className="container max-w-2xl py-8">
      {fromOnboarding && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-3 text-sm">
          <Link href={`/${locale}/onboarding`} className="text-primary underline">
            {tOnboarding("returnBanner")}
          </Link>
        </div>
      )}
      <h1 className="mb-6 text-2xl font-bold">{t("createTitle")}</h1>
      <JobPostingForm companyId={profile.id} />
    </main>
  );
}
