"use client";

import { DashboardGreeting } from "./DashboardGreeting";
import { GettingStartedWidget } from "./GettingStartedWidget";
import { WidgetSlot } from "./WidgetSlot";

interface DashboardShellProps {
  displayName: string;
  avatarUrl?: string | null;
}

// For Epic 1: no sidebar widgets are enabled yet.
// As later epics ship, flip the relevant `enabled` prop to true.
const hasEnabledWidgets = false;

export function DashboardShell({ displayName, avatarUrl }: DashboardShellProps) {
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
            {/* Future widget slots go here as epics ship */}
            <WidgetSlot enabled={false} title="">
              {null}
            </WidgetSlot>
          </aside>
        )}
      </div>
    </div>
  );
}
