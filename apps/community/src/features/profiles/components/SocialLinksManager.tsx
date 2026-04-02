"use client";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useUnlinkSocialAccount } from "@/features/profiles/hooks/use-profile";
import type { CommunitySocialLink } from "@igbo/db/schema/community-profiles";
import type { SocialProvider } from "@/features/profiles/types";

const PROVIDERS: { key: SocialProvider; label: string }[] = [
  { key: "FACEBOOK", label: "Facebook" },
  { key: "LINKEDIN", label: "LinkedIn" },
  { key: "TWITTER", label: "Twitter / X" },
  { key: "INSTAGRAM", label: "Instagram" },
];

interface Props {
  socialLinks: CommunitySocialLink[];
  linkedParam?: string | null;
  errorParam?: string | null;
}

export function SocialLinksManager({ socialLinks, linkedParam, errorParam }: Props) {
  const t = useTranslations("Settings.privacy");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mutateAsync: unlink, isPending: isUnlinking } = useUnlinkSocialAccount();

  const linkedProvider = linkedParam ?? searchParams.get("linked");
  const errorProvider = errorParam ?? searchParams.get("error");

  useEffect(() => {
    if (linkedProvider) {
      // Clear the query param after showing success
      const url = new URL(window.location.href);
      // eslint-disable-next-line drizzle/enforce-delete-with-where
      url.searchParams.delete("linked");
      // eslint-disable-next-line drizzle/enforce-delete-with-where
      url.searchParams.delete("provider");
      router.replace(url.pathname + (url.search !== "?" ? url.search : ""));
    }
    if (errorProvider) {
      const url = new URL(window.location.href);
      // eslint-disable-next-line drizzle/enforce-delete-with-where
      url.searchParams.delete("error");
      // eslint-disable-next-line drizzle/enforce-delete-with-where
      url.searchParams.delete("provider");
      router.replace(url.pathname + (url.search !== "?" ? url.search : ""));
    }
  }, [linkedProvider, errorProvider, router]);

  const linkedMap = new Map(socialLinks.map((l) => [l.provider, l]));

  function handleLink(provider: SocialProvider) {
    router.push(`/api/v1/profiles/social-link/${provider.toLowerCase()}`);
  }

  async function handleUnlink(provider: SocialProvider) {
    await unlink(provider);
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">{t("socialLinks.heading")}</h2>

      {linkedProvider && (
        <div className="rounded bg-green-50 px-4 py-2 text-sm text-green-700" role="status">
          {t("socialLinks.linkSuccess")}
        </div>
      )}
      {errorProvider && (
        <div className="rounded bg-red-50 px-4 py-2 text-sm text-red-700" role="alert">
          {t("socialLinks.linkError")}
        </div>
      )}

      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
        {PROVIDERS.map(({ key, label }) => {
          const linked = linkedMap.get(key);
          return (
            <li key={key} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{label}</p>
                {linked && (
                  <p className="text-xs text-gray-500">
                    {t("socialLinks.linked")}: {linked.providerDisplayName}
                  </p>
                )}
              </div>
              <div>
                {linked ? (
                  <button
                    type="button"
                    onClick={() => void handleUnlink(key)}
                    disabled={isUnlinking}
                    className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                  >
                    {t("socialLinks.unlink")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleLink(key)}
                    className="text-sm text-indigo-600 hover:text-indigo-800"
                  >
                    {t("socialLinks.link")}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
