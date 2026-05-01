"use client";

import { useEffect, useCallback, useContext } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { usePortalSocket } from "@/providers/SocketProvider";
import { useRouter } from "@/i18n/navigation";
import { NotificationCountContext } from "@/providers/notification-count-context";

interface NotificationEvent {
  title: string;
  body?: string;
  link?: string;
}

/**
 * Listens on the portal socket for `notification:new` events and fires a Sonner toast.
 * Signals count increments via NotificationCountContext.
 * On socket reconnect, calls syncFromServer() to restore authoritative count.
 * Must be rendered inside NotificationToastProvider (which is inside NextIntlClientProvider).
 * (P-6.3)
 */
export function useNotificationToast() {
  const { portalSocket } = usePortalSocket();
  const router = useRouter();
  const t = useTranslations("Portal.notifications");
  const { increment, syncFromServer } = useContext(NotificationCountContext);

  const handler = useCallback(
    (notif: NotificationEvent) => {
      increment();
      toast(notif.title, {
        description: notif.body,
        duration: 5000,
        ...(notif.link
          ? {
              onClick: () => router.push(notif.link!),
              action: {
                label: t("viewAction"),
                onClick: () => router.push(notif.link!),
              },
            }
          : {}),
      });
    },
    [increment, t, router],
  );

  useEffect(() => {
    if (!portalSocket) return;

    portalSocket.on("notification:new", handler);
    portalSocket.on("connect", syncFromServer);

    return () => {
      portalSocket.off("notification:new", handler);
      portalSocket.off("connect", syncFromServer);
    };
  }, [portalSocket, handler, syncFromServer]);
}
