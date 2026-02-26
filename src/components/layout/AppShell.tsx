"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TopNav } from "./TopNav";
import { BottomNav } from "./BottomNav";
import { Footer } from "./Footer";
import { SocketProvider } from "@/providers/SocketProvider";

function AppQueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }),
  );
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AppQueryProvider>
      <SocketProvider>
        <div className="flex min-h-screen flex-col">
          <TopNav />
          <main id="main-content" className="flex-1 pb-14 md:pb-0" tabIndex={-1}>
            {children}
          </main>
          <div className="hidden md:block">
            <Footer />
          </div>
          {/* Mobile bottom nav — visible below md breakpoint */}
          <BottomNav />
        </div>
      </SocketProvider>
    </AppQueryProvider>
  );
}

export { AppShell };
