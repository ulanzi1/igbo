import { getTranslations } from "next-intl/server";
import { NotificationPreferencesPageContent } from "@/components/settings/NotificationPreferencesPageContent";

export async function generateMetadata() {
  const t = await getTranslations("Portal.notificationPreferences");
  return { title: t("pageTitle") };
}

export default function NotificationPreferencesPage() {
  return <NotificationPreferencesPageContent />;
}
