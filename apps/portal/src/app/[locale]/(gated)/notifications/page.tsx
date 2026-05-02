import { getTranslations } from "next-intl/server";
import { NotificationList } from "@/components/domain/notification-list";

export async function generateMetadata() {
  const t = await getTranslations("Portal.notificationCenter");
  return { title: t("title") };
}

export default function NotificationsPage() {
  return (
    <div className="mx-auto max-w-2xl py-6 px-4">
      <NotificationList />
    </div>
  );
}
