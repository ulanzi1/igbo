import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

function Footer() {
  const t = useTranslations("Navigation");
  const tShell = useTranslations("Shell");
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-background py-6 px-4">
      <div className="mx-auto max-w-7xl flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
        <p className="text-sm text-muted-foreground">{tShell("copyright", { year })}</p>
        <nav aria-label="Footer navigation" className="flex gap-4">
          <Link href="/about" className="text-sm text-muted-foreground hover:text-foreground">
            {t("about")}
          </Link>
          <Link href="/terms" className="text-sm text-muted-foreground hover:text-foreground">
            {t("terms")}
          </Link>
          <Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground">
            {t("privacy")}
          </Link>
        </nav>
      </div>
    </footer>
  );
}

export { Footer };
