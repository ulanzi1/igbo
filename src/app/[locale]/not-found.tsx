import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";

export default async function NotFound() {
  const locale = await getLocale();
  setRequestLocale(locale);
  const t = await getTranslations("Errors");

  return (
    <main
      id="main-content"
      className="flex min-h-screen flex-col items-center justify-center gap-4"
    >
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-lg text-muted-foreground">{t("notFound")}</p>
      <p className="text-sm text-muted-foreground">{t("notFoundDescription")}</p>
    </main>
  );
}
