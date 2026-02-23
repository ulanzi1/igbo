"use client";

import { MenuIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ContrastToggle } from "@/components/shared/ContrastToggle";
import { LanguageToggle } from "@/components/shared/LanguageToggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

function GuestNav({ className }: { className?: string }) {
  const t = useTranslations("Navigation");
  const tShell = useTranslations("Shell");
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex h-16 w-full items-center border-b border-border bg-background px-4",
        className,
      )}
    >
      {/* Logo */}
      <Link
        href="/"
        className="flex items-center gap-2 min-h-[44px] min-w-[44px] font-semibold"
        aria-label={tShell("appName")}
      >
        <span className="text-primary font-bold">Igbo</span>
      </Link>

      {/* Desktop nav links */}
      <nav aria-label="Guest navigation" className="hidden md:flex items-center gap-1 ml-6">
        <Link
          href="/about"
          className="flex items-center min-h-[44px] px-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {t("about")}
        </Link>
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Desktop right actions */}
      <div className="hidden md:flex items-center gap-2">
        <LanguageToggle />
        <ContrastToggle />
        <Button asChild variant="default" className="min-h-[44px]">
          <Link href="/apply">{t("join")}</Link>
        </Button>
      </div>

      {/* Mobile hamburger */}
      <button
        type="button"
        aria-label={menuOpen ? tShell("menuClose") : tShell("menuOpen")}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(true)}
        className="flex md:hidden h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-muted-foreground hover:bg-muted transition-colors"
      >
        <MenuIcon className="size-5" aria-hidden="true" />
      </button>

      {/* Mobile menu sheet */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="right" className="w-72">
          <SheetHeader>
            <SheetTitle className="text-left">{tShell("appName")}</SheetTitle>
          </SheetHeader>
          <nav aria-label="Mobile guest navigation" className="mt-6 flex flex-col gap-2">
            <Link
              href="/about"
              onClick={() => setMenuOpen(false)}
              className="flex items-center min-h-[44px] px-3 rounded-md text-sm font-medium hover:bg-muted transition-colors"
            >
              {t("about")}
            </Link>
            <div className="flex gap-2 pt-2">
              <LanguageToggle />
              <ContrastToggle />
            </div>
            <Button asChild variant="default" className="mt-4 min-h-[44px]">
              <Link href="/apply" onClick={() => setMenuOpen(false)}>
                {t("join")}
              </Link>
            </Button>
          </nav>
        </SheetContent>
      </Sheet>
    </header>
  );
}

export { GuestNav };
