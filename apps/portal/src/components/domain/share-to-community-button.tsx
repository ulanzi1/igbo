"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Share2, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ShareToCommunityButtonProps {
  jobId: string;
  isActive: boolean;
  isShared: boolean;
  onShared?: () => void;
}

export function ShareToCommunityButton({
  jobId,
  isActive,
  isShared,
  onShared,
}: ShareToCommunityButtonProps) {
  const t = useTranslations("Portal.analytics");
  const [loading, setLoading] = React.useState(false);
  const [shared, setShared] = React.useState(isShared);

  const handleShare = async () => {
    if (!isActive || shared || loading) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/share-community`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: window.location.origin,
        },
      });

      if (res.status === 409) {
        toast.info(t("alreadyShared"));
        setShared(true);
        return;
      }

      if (!res.ok) {
        throw new Error("Share failed");
      }

      setShared(true);
      toast.success(t("shareSuccess"));
      onShared?.();
    } catch {
      toast.error(t("shareError"));
    } finally {
      setLoading(false);
    }
  };

  if (shared) {
    return (
      <button
        type="button"
        disabled
        aria-label={t("sharedButton")}
        className="inline-flex cursor-not-allowed items-center gap-2 rounded-md bg-muted px-4 py-2 text-sm font-medium text-muted-foreground opacity-75"
      >
        <CheckCircle className="h-4 w-4" aria-hidden="true" />
        {t("sharedButton")}
      </button>
    );
  }

  if (!isActive) {
    return (
      <span title={t("shareDisabledTooltip")}>
        <button
          type="button"
          disabled
          aria-label={t("shareDisabledTooltip")}
          className="inline-flex cursor-not-allowed items-center gap-2 rounded-md bg-primary/50 px-4 py-2 text-sm font-medium text-primary-foreground opacity-50"
        >
          <Share2 className="h-4 w-4" aria-hidden="true" />
          {t("shareButton")}
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={loading}
      aria-busy={loading}
      className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <Share2 className="h-4 w-4" aria-hidden="true" />
      )}
      {t("shareButton")}
    </button>
  );
}

export function ShareToCommunityButtonSkeleton() {
  return (
    <div
      className="inline-flex h-9 w-44 animate-pulse items-center gap-2 rounded-md bg-muted"
      aria-hidden="true"
    />
  );
}
