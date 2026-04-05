import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { getJobPostingWithCompany } from "@igbo/db/queries/portal-job-postings";
import { sanitizeHtml } from "@/lib/sanitize";
import { ViewTracker } from "@/components/domain/view-tracker";

interface PageProps {
  params: Promise<{ locale: string; jobId: string }>;
}

export default async function JobDetailPage({ params }: PageProps) {
  const { locale, jobId } = await params;
  const pt = await getTranslations("Portal.posting");
  const jt = await getTranslations("Portal.jobDetail");

  const result = await getJobPostingWithCompany(jobId);
  if (!result || result.posting.status !== "active") {
    redirect(`/${locale}/jobs`);
  }

  const { posting, company } = result;

  return (
    <div className="max-w-2xl py-8">
      <ViewTracker jobId={jobId} />

      <div className="mb-6">
        <h1 className="text-3xl font-bold">{posting.title}</h1>
        <p className="mt-1 text-xl font-medium text-muted-foreground">{company.name}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {posting.location ?? jt("remote")} &middot;{" "}
          {pt(`employmentType.${posting.employmentType}`)}
        </p>

        {(posting.salaryMin || posting.salaryMax || posting.salaryCompetitiveOnly) && (
          <p className="mt-2 text-sm">
            {posting.salaryCompetitiveOnly
              ? jt("competitiveSalary")
              : posting.salaryMin && posting.salaryMax
                ? jt("salaryRange", {
                    min: `$${posting.salaryMin.toLocaleString()}`,
                    max: `$${posting.salaryMax.toLocaleString()}`,
                  })
                : posting.salaryMin
                  ? jt("salaryFrom", { amount: `$${posting.salaryMin.toLocaleString()}` })
                  : jt("salaryUpTo", { amount: `$${posting.salaryMax?.toLocaleString()}` })}
          </p>
        )}
      </div>

      {posting.descriptionHtml && (
        <section aria-labelledby="description-heading" className="mb-6">
          <h2 id="description-heading" className="mb-2 text-lg font-semibold">
            {jt("jobDescription")}
          </h2>
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(posting.descriptionHtml) }}
          />
        </section>
      )}

      {posting.requirements && (
        <section aria-labelledby="requirements-heading" className="mb-6">
          <h2 id="requirements-heading" className="mb-2 text-lg font-semibold">
            {jt("requirements")}
          </h2>
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(posting.requirements) }}
          />
        </section>
      )}
    </div>
  );
}
