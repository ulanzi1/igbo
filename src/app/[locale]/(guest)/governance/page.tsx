import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { listPublishedDocuments } from "@/services/governance-document-service";
import { sanitizeHtml } from "@/lib/sanitize";

export const revalidate = 60;

export default async function GovernancePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Governance");

  const documents = await listPublishedDocuments("public");

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 md:py-16">
      <h1 className="text-3xl md:text-4xl font-bold text-primary mb-4">{t("title")}</h1>
      <p className="text-muted-foreground mb-10">{t("subtitle")}</p>

      {documents.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="space-y-4">
          {documents.map((doc) => {
            const hasIgbo = Boolean(doc.contentIgbo);
            const rawContent = locale === "ig" && hasIgbo ? doc.contentIgbo! : doc.content;
            const content = sanitizeHtml(rawContent);
            const lastUpdated = doc.publishedAt ?? doc.updatedAt;
            return (
              <li key={doc.id} className="rounded-xl border bg-card p-6 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">{doc.title}</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t("lastUpdated", { date: lastUpdated.toLocaleDateString(locale) })}
                    </p>
                    <div className="flex gap-2 mt-2">
                      <span className="text-xs rounded-full bg-muted px-2 py-0.5">EN</span>
                      {hasIgbo && (
                        <span className="text-xs rounded-full bg-muted px-2 py-0.5">IG</span>
                      )}
                    </div>
                  </div>
                  <a
                    href={`/api/v1/governance-documents/${doc.slug}/download?locale=${locale}`}
                    className="shrink-0 text-sm font-medium text-primary hover:underline"
                    download
                  >
                    {t("download")}
                  </a>
                </div>
                <div
                  className="prose prose-sm max-w-none text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: content }}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
