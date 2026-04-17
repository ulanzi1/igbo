"use client";

import { useState } from "react";
import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { buildSignInUrl } from "@/lib/guest-utils";

const DISMISSED_KEY = "guest_banner_dismissed";

export interface GuestConversionBannerProps {
  communityUrl: string;
  callbackUrl: string;
}

export function GuestConversionBanner({ communityUrl, callbackUrl }: GuestConversionBannerProps) {
  const t = useTranslations("Portal.guest");
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(DISMISSED_KEY) === "true";
  });

  function handleDismiss() {
    sessionStorage.setItem(DISMISSED_KEY, "true");
    setDismissed(true);
  }

  if (dismissed) return null;

  const signInUrl = buildSignInUrl(communityUrl, callbackUrl);
  const joinUrl = `${communityUrl}/join`;

  return (
    <Card role="complementary" aria-label={t("signInToApply")}>
      <CardContent className="relative p-4">
        <button
          type="button"
          onClick={handleDismiss}
          aria-label={t("dismissBanner")}
          data-testid="dismiss-banner"
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
        >
          <XIcon className="size-4" aria-hidden="true" />
        </button>

        <h2 className="text-base font-semibold text-foreground mb-1">
          {t("conversionBannerTitle")}
        </h2>
        <p className="text-sm text-muted-foreground mb-4">{t("conversionBannerDescription")}</p>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button asChild size="sm">
            <a href={signInUrl}>{t("conversionBannerSignIn")}</a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={joinUrl}>{t("conversionBannerRegister")}</a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
