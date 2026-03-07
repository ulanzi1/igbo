"use client";

import { useTranslations } from "next-intl";
import { PushSubscriptionToggle } from "@/components/notifications/PushSubscriptionToggle";

export default function NotificationsSettingsPage() {
  const t = useTranslations("Notifications.push");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t("sectionTitle")}</h2>
      </div>
      <div className="rounded-md border p-4">
        <PushSubscriptionToggle />
      </div>
    </div>
  );
}
