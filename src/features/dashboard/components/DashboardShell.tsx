"use client";

import { useTranslations } from "next-intl";
import { DashboardGreeting } from "./DashboardGreeting";
import { GettingStartedWidget } from "./GettingStartedWidget";
import { WidgetSlot } from "./WidgetSlot";
import { PeopleNearYouWidget } from "./PeopleNearYouWidget";

interface DashboardShellProps {
  displayName: string;
  avatarUrl?: string | null;
}

// Story 3.3: People near you widget is now enabled.
const hasEnabledWidgets = true; // WAS: false

export function DashboardShell({ displayName, avatarUrl }: DashboardShellProps) {
  const t = useTranslations("Dashboard");

  return (
    <div className="container mx-auto px-4 py-6">
      <DashboardGreeting displayName={displayName} avatarUrl={avatarUrl} />
      <div className="mt-6 flex flex-col lg:flex-row gap-6">
        {/* Primary content — full width when no sidebar widgets enabled */}
        <main className={hasEnabledWidgets ? "lg:w-[65%]" : "w-full"}>
          <GettingStartedWidget />
        </main>
        {/* Sidebar — only render when at least one widget is enabled */}
        {hasEnabledWidgets && (
          <aside className="lg:w-[35%] flex flex-col gap-4">
            <WidgetSlot enabled={true} title={t("peopleNear.title")}>
              <PeopleNearYouWidget />
            </WidgetSlot>
          </aside>
        )}
      </div>
    </div>
  );
}
