"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Settings");
  const pathname = usePathname();
  const params = useParams<{ locale: string }>();
  const locale = params.locale ?? "en";

  const tabs = [
    { label: t("profileTab"), href: `/${locale}/settings/profile` },
    { label: t("privacyTab"), href: `/${locale}/settings/privacy` },
    { label: t("securityTab"), href: `/${locale}/settings/security` },
  ];

  return (
    <div>
      <nav className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-2xl px-4">
          <div className="flex gap-6">
            {tabs.map((tab) => {
              const isActive = pathname.endsWith(tab.href.split("/").pop() ?? "");
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`border-b-2 px-1 py-4 text-sm font-medium transition-colors ${
                    isActive
                      ? "border-indigo-600 text-indigo-600"
                      : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}
