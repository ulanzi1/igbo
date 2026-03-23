"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { TopNav } from "./TopNav";
import { BottomNav } from "./BottomNav";
import { Footer } from "./Footer";
import { SocketProvider } from "@/providers/SocketProvider";
import { WarningBanner } from "@/components/shared/WarningBanner";

function AppQueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }),
  );
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function ActiveWarningsBanner() {
  const { status } = useSession();
  const { data } = useQuery({
    queryKey: ["user-warnings"],
    queryFn: async () => {
      const res = await fetch("/api/v1/user/warnings", { credentials: "include" });
      if (!res.ok) return { warnings: [] };
      const json = (await res.json()) as {
        data: { warnings: Array<{ id: string; reason: string; createdAt: string }> };
      };
      return json.data;
    },
    enabled: status === "authenticated",
    staleTime: 5 * 60 * 1000, // 5 min
  });

  if (!data?.warnings?.length) return null;
  return <WarningBanner warnings={data.warnings} />;
}

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AppQueryProvider>
      <SocketProvider>
        <div className="flex min-h-screen flex-col">
          <TopNav />
          <ActiveWarningsBanner />
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
