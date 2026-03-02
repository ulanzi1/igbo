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

serwist.addEventListeners();
