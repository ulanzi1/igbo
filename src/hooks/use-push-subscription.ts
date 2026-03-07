"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { env } from "@/env";

export type PushSubscriptionStatus =
  | "unsupported"
  | "denied"
  | "subscribed"
  | "unsubscribed"
  | "loading";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function usePushSubscription() {
  const [status, setStatus] = useState<PushSubscriptionStatus>("loading");
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined);
  const subscriptionRef = useRef<PushSubscription | undefined>(undefined);

  useEffect(() => {
    async function init() {
      if (!("PushManager" in window) || !("serviceWorker" in navigator)) {
        setStatus("unsupported");
        return;
      }

      if (Notification.permission === "denied") {
        setStatus("denied");
        return;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        registrationRef.current = registration;
        const existing = await registration.pushManager.getSubscription();
        if (existing) {
          subscriptionRef.current = existing;
          setStatus("subscribed");
        } else {
          setStatus("unsubscribed");
        }
      } catch {
        setStatus("unsubscribed");
      }
    }

    void init();
  }, []);

  const subscribe = useCallback(async () => {
    const registration = registrationRef.current;
    if (!registration) return;

    setStatus("loading");
    try {
      const permission = await Notification.requestPermission();
      if (permission === "denied") {
        setStatus("denied");
        return;
      }

      const vapidKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey ? urlBase64ToUint8Array(vapidKey) : undefined,
      });

      subscriptionRef.current = subscription;

      const subJson = subscription.toJSON();
      const res = await fetch("/api/v1/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: {
            p256dh: subJson.keys?.p256dh ?? "",
            auth: subJson.keys?.auth ?? "",
          },
        }),
      });

      if (!res.ok) {
        await subscription.unsubscribe();
        setStatus("unsubscribed");
        return;
      }

      setStatus("subscribed");
    } catch {
      setStatus("unsubscribed");
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    const subscription = subscriptionRef.current;
    if (!subscription) return;

    setStatus("loading");
    try {
      await subscription.unsubscribe();
      subscriptionRef.current = undefined;

      await fetch("/api/v1/push/subscribe", { method: "DELETE" });

      setStatus("unsubscribed");
    } catch {
      setStatus("subscribed");
    }
  }, []);

  return { status, subscribe, unsubscribe };
}
