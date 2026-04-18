import { getTranslations } from "next-intl/server";
import { GraduationCapIcon } from "lucide-react";

export default async function ApprenticeshipsPage() {
  const t = await getTranslations("Portal.nav");
  const tLifecycle = await getTranslations("Portal.lifecycle");

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <GraduationCapIcon className="size-12 text-muted-foreground mb-4" aria-hidden="true" />
      <h1 className="text-2xl font-bold mb-2">{t("apprenticeships")}</h1>
      <p className="text-muted-foreground">{tLifecycle("comingSoon")}</p>
    </div>
  );
}
