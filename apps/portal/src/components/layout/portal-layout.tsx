"use client";

import { PortalTopNav } from "./portal-top-nav";
import { PortalBottomNav } from "./portal-bottom-nav";
import { UnreadMessageCountProvider } from "@/providers/unread-message-count-context";

export function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <UnreadMessageCountProvider>
      <PortalTopNav />
      <main id="main-content" className="min-h-screen pb-16 md:pb-0 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
      <PortalBottomNav />
    </UnreadMessageCountProvider>
  );
}
