import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { requireCompanyProfile } from "@/lib/require-company-profile";
import { getJobPostingsByCompanyId } from "@igbo/db/queries/portal-job-postings";
import { JobPostingCard } from "@/components/domain/job-posting-card";
import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function MyJobsPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations("Portal.myJobs");

  const profile = await requireCompanyProfile(locale);
  if (!profile) {
    redirect(`/${locale}`);
  }

  const postings = await getJobPostingsByCompanyId(profile.id);

  return (
    <main id="main-content" className="container py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Link
          href={`/${locale}/jobs/new`}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          {t("createNew")}
        </Link>
      </div>

      {postings.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-lg font-medium">{t("empty")}</p>
          <p className="mt-2 text-sm text-muted-foreground">{t("emptyDescription")}</p>
          <Link
            href={`/${locale}/jobs/new`}
            className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            {t("createFirst")}
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {postings.map((posting) => (
            <li key={posting.id}>
              <JobPostingCard posting={posting} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
