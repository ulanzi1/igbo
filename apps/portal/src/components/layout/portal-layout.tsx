"use client";

import { PortalTopNav } from "./portal-top-nav";
import { PortalBottomNav } from "./portal-bottom-nav";

export function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PortalTopNav />
      <main id="main-content" className="min-h-screen pb-16 md:pb-0">
        {children}
      </main>
      <PortalBottomNav />
    </>
  );
}
