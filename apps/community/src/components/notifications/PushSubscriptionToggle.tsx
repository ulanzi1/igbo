"use client";

import { useTranslations } from "next-intl";
import { usePushSubscription } from "@/hooks/use-push-subscription";

export function PushSubscriptionToggle() {
  const t = useTranslations("Notifications.push");
  const { status, subscribe, unsubscribe } = usePushSubscription();

  if (status === "unsupported") {
    return (
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          disabled
          checked={false}
          className="h-4 w-4 cursor-not-allowed opacity-50"
          readOnly
        />
        <div>
          <p className="text-sm font-medium text-muted-foreground">{t("enableLabel")}</p>
          <p className="text-xs text-muted-foreground">{t("unsupportedBrowser")}</p>
        </div>
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          disabled
          checked={false}
          className="h-4 w-4 cursor-not-allowed opacity-50"
          readOnly
        />
        <div>
          <p className="text-sm font-medium text-muted-foreground">{t("enableLabel")}</p>
          <p className="text-xs text-muted-foreground">{t("permissionDenied")}</p>
        </div>
      </div>
    );
  }

  const isLoading = status === "loading";
  const isSubscribed = status === "subscribed";

  return (
    <div className="flex items-center gap-3">
      <input
        type="checkbox"
        id="push-toggle"
        checked={isSubscribed}
        disabled={isLoading}
        onChange={isSubscribed ? () => void unsubscribe() : () => void subscribe()}
        className="h-4 w-4"
      />
      <label htmlFor="push-toggle" className="text-sm font-medium cursor-pointer">
        {t("enableLabel")}
      </label>
      {isLoading && <span className="text-xs text-muted-foreground">...</span>}
    </div>
  );
}
