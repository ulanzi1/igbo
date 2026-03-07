"use client";

import { useTranslations } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotificationPreferencesMatrix } from "@/components/notifications/NotificationPreferencesMatrix";
import { QuietHoursForm } from "@/components/notifications/QuietHoursForm";
import { PushSubscriptionToggle } from "@/components/notifications/PushSubscriptionToggle";

const queryClient = new QueryClient();

export default function NotificationsSettingsPage() {
  const t = useTranslations("Notifications");

  return (
    <QueryClientProvider client={queryClient}>
      <div className="space-y-8">
        {/* Preferences Matrix */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t("preferences.pageTitle")}</h2>
          <NotificationPreferencesMatrix />
        </section>

        {/* Quiet Hours */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t("quietHours.title")}</h2>
          <QuietHoursForm />
        </section>

        {/* Push Notifications */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t("push.sectionTitle")}</h2>
          <div className="rounded-md border p-4">
            <PushSubscriptionToggle />
          </div>
        </section>
      </div>
    </QueryClientProvider>
  );
}
