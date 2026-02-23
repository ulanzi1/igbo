import { TopNav } from "./TopNav";
import { BottomNav } from "./BottomNav";
import { Footer } from "./Footer";

function AppShell({ children }: { children: React.ReactNode }) {
  return (
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
  );
}

export { AppShell };
