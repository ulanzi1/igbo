import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "ig"],
  defaultLocale: "en",
  localeCookie: {
    maxAge: 60 * 60 * 24 * 365, // 1 year — persists locale for returning guests
  },
});
