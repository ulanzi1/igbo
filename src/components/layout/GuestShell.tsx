"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GuestNav } from "./GuestNav";
import { Footer } from "./Footer";

function GuestQueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }),
  );
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function GuestShell({ children }: { children: React.ReactNode }) {
  return (
    <GuestQueryProvider>
      <div className="flex min-h-screen flex-col">
        <GuestNav />
        <main id="main-content" className="flex-1" tabIndex={-1}>
          {children}
        </main>
        <Footer />
      </div>
    </GuestQueryProvider>
  );
}

export { GuestShell };
