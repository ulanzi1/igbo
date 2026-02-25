"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";

const COOKIE_NAME = "cookie-consent";
const COOKIE_VERSION = "1.0";
const COOKIE_MAX_AGE_SECONDS = 31536000; // 1 year

interface ConsentPreferences {
  essential: true;
  analytics: boolean;
  preferences: boolean;
  version: string;
  timestamp: number;
}

function readConsentCookie(): ConsentPreferences | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((row) => row.startsWith(`${COOKIE_NAME}=`));
  if (!match) return null;
  try {
    const value = match.split("=").slice(1).join("=");
    return JSON.parse(decodeURIComponent(value)) as ConsentPreferences;
  } catch {
    return null;
  }
}

function writeConsentCookie(prefs: ConsentPreferences): void {
  const value = encodeURIComponent(JSON.stringify(prefs));
  document.cookie = `${COOKIE_NAME}=${value}; max-age=${COOKIE_MAX_AGE_SECONDS}; path=/; SameSite=Lax`;
}

export function CookieConsentBanner() {
  const t = useTranslations("cookieConsent");
  const [visible, setVisible] = useState(() => {
    const existing = readConsentCookie();
    return !existing || existing.version !== COOKIE_VERSION;
  });
  const [analytics, setAnalytics] = useState(false);
  const [preferences, setPreferences] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);

  const save = (analyticsConsent: boolean, preferencesConsent: boolean) => {
    const prefs: ConsentPreferences = {
      essential: true,
      analytics: analyticsConsent,
      preferences: preferencesConsent,
      version: COOKIE_VERSION,
      timestamp: Date.now(),
    };
    writeConsentCookie(prefs);
    setVisible(false);
    // Note: analytics integrations (e.g. Plausible, PostHog) should check
    // this cookie before initializing. Only initialize analytics if prefs.analytics === true.
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label={t("title")}
      className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-lg p-4"
    >
      <div className="mx-auto max-w-4xl">
        <h2 className="text-base font-semibold text-gray-900 mb-1">{t("title")}</h2>
        <p className="text-sm text-gray-600 mb-4">{t("description")}</p>

        {showCustomize && (
          <div className="mb-4 space-y-2">
            {/* Essential — always on, locked */}
            <label className="flex items-center gap-3">
              <input type="checkbox" checked disabled className="h-4 w-4 rounded" />
              <span className="text-sm text-gray-700">{t("essential")}</span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={analytics}
                onChange={(e) => setAnalytics(e.target.checked)}
                className="h-4 w-4 rounded"
              />
              <span className="text-sm text-gray-700">{t("analytics")}</span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={preferences}
                onChange={(e) => setPreferences(e.target.checked)}
                className="h-4 w-4 rounded"
              />
              <span className="text-sm text-gray-700">{t("preferences")}</span>
            </label>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => save(true, true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded"
          >
            {t("acceptAll")}
          </button>
          <button
            onClick={() => save(false, false)}
            className="bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-medium px-4 py-2 rounded"
          >
            {t("acceptEssential")}
          </button>
          {showCustomize ? (
            <button
              onClick={() => save(analytics, preferences)}
              className="bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-medium px-4 py-2 rounded"
            >
              {t("save")}
            </button>
          ) : (
            <button
              onClick={() => setShowCustomize(true)}
              className="text-indigo-600 hover:underline text-sm font-medium px-4 py-2"
            >
              {t("customize")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
