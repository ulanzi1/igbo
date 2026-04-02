"use client";

import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

export type DeliveryStatus = "sending" | "sent" | "delivered" | "read" | "error";

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

  if (status === "read") {
    return (
      <span className={cn("text-xs text-blue-500", className)} aria-label={t("read")}>
        ✓✓
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
