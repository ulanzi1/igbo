"use client";

import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

type DeliveryStatus = "sending" | "sent" | "delivered" | "error";

interface DeliveryIndicatorProps {
  status: DeliveryStatus;
  className?: string;
}

export function DeliveryIndicator({ status, className }: DeliveryIndicatorProps) {
  const t = useTranslations("Chat.messages");

  if (status === "error") {
    return (
      <span className={cn("text-xs text-destructive", className)} aria-label={t("failedToSend")}>
        ✕
      </span>
    );
  }

  if (status === "sending") {
    return (
      <span
        className={cn("text-xs text-muted-foreground opacity-50", className)}
        aria-label={t("sending")}
      >
        ✓
      </span>
    );
  }

  if (status === "sent") {
    return (
      <span className={cn("text-xs text-muted-foreground", className)} aria-label={t("sent")}>
        ✓
      </span>
    );
  }

  // delivered
  return (
    <span className={cn("text-xs text-muted-foreground", className)} aria-label={t("delivered")}>
      ✓✓
    </span>
  );
}
