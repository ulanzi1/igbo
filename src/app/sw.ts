import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Exclude /api/ routes from SW caching — API responses must always be fresh
// to avoid stale data (e.g. deleted messages reappearing after refresh).
const runtimeCaching: RuntimeCaching[] = defaultCache.filter((entry) => {
  const pattern = entry.matcher;
  if (pattern instanceof RegExp) {
    return !pattern.test("/api/test");
  }
  return true;
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  fallbacks: {
    entries: [
      {
        url: "/en/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
      {
        url: "/ig/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

// Push event: display notification when a push message is received (Story 9.3)
// Must be registered BEFORE serwist.addEventListeners()
self.addEventListener("push", (event) => {
  const e = event as PushEvent;
  const data = e.data?.json() as
    | {
        title: string;
        body: string;
        icon: string;
        link: string;
        tag?: string;
      }
    | undefined;
  if (!data) return;
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon ?? "/icon-192.png",
      tag: data.tag,
      data: { url: data.link },
    }),
  );
});

// Notification click: close notification and navigate to relevant content (Story 9.3)
// Must be registered BEFORE serwist.addEventListeners()
self.addEventListener("notificationclick", (event) => {
  const e = event as NotificationEvent;
  e.notification.close();
  e.waitUntil(clients.openWindow((e.notification.data?.url as string | undefined) ?? "/"));
});

serwist.addEventListeners();
