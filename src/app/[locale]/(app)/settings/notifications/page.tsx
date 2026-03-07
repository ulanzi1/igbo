"use client";

import { useTranslations } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotificationPreferencesMatrix } from "@/components/notifications/NotificationPreferencesMatrix";
import { QuietHoursForm } from "@/components/notifications/QuietHoursForm";

const queryClient = new QueryClient();

export default function NotificationsSettingsPage() {
  const t = useTranslations("Notifications");

  return (
    <QueryClientProvider client={queryClient}>
      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="space-y-8">
          {/* Preferences Matrix — Push column header contains PushSubscriptionToggle (B2/U4+U5) */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">{t("preferences.pageTitle")}</h2>
            <NotificationPreferencesMatrix />
          </section>

          {/* Quiet Hours */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">{t("quietHours.title")}</h2>
            <QuietHoursForm />
          </section>
        </div>
      </main>
    </QueryClientProvider>
  );
}
