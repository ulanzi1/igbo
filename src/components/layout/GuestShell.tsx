import { GuestNav } from "./GuestNav";
import { Footer } from "./Footer";

function GuestShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <GuestNav />
      <main id="main-content" className="flex-1" tabIndex={-1}>
        {children}
      </main>
      <Footer />
    </div>
  );
}

export { GuestShell };
