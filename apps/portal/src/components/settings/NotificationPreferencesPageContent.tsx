"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { NotificationCategoryRow } from "./NotificationCategoryRow";
import type { CategoryPreference } from "./NotificationCategoryRow";
import { QuietHoursSection } from "./QuietHoursSection";
import type { QuietHoursValues } from "./QuietHoursSection";
import { DigestFrequencySelector } from "@/components/domain/digest-frequency-selector";
import type { DigestFrequency } from "@/components/domain/digest-frequency-selector";
import type {
  PortalNotificationCatalogEntry,
  PortalNotificationEventType,
} from "@igbo/config/notifications";
import { isLowPriority } from "@igbo/config/notifications";

// Map portal event type → i18n key suffix for Portal.notificationPreferences.eventLabel.*
const EVENT_TYPE_LABEL_MAP: Record<PortalNotificationEventType, string> = {
  "portal.application.submitted": "eventLabel.applicationSubmitted",
  "portal.application.withdrawn": "eventLabel.applicationWithdrawn",
  "portal.application.status_changed": "eventLabel.applicationStatusChanged",
  "portal.application.viewed": "eventLabel.applicationViewed",
  "portal.message.received": "eventLabel.messageReceived",
  "portal.job.approved": "eventLabel.jobApproved",
  "portal.job.rejected": "eventLabel.jobRejected",
  "portal.job.changes_requested": "eventLabel.jobChangesRequested",
  "portal.job.expired": "eventLabel.jobExpired",
  "portal.referral.status_changed": "eventLabel.referralStatusChanged",
  "portal.match.new_recommendations": "eventLabel.matchNewRecommendations",
  "portal.saved_search.new_results": "eventLabel.savedSearchNewResults",
};

const EVENT_TYPE_DESCRIPTION_MAP: Record<PortalNotificationEventType, string> = {
  "portal.application.submitted": "eventDescription.applicationSubmitted",
  "portal.application.withdrawn": "eventDescription.applicationWithdrawn",
  "portal.application.status_changed": "eventDescription.applicationStatusChanged",
  "portal.application.viewed": "eventDescription.applicationViewed",
  "portal.message.received": "eventDescription.messageReceived",
  "portal.job.approved": "eventDescription.jobApproved",
  "portal.job.rejected": "eventDescription.jobRejected",
  "portal.job.changes_requested": "eventDescription.jobChangesRequested",
  "portal.job.expired": "eventDescription.jobExpired",
  "portal.referral.status_changed": "eventDescription.referralStatusChanged",
  "portal.match.new_recommendations": "eventDescription.matchNewRecommendations",
  "portal.saved_search.new_results": "eventDescription.savedSearchNewResults",
};

interface PreferencesApiResponse {
  data: {
    preferences: Record<
      string,
      {
        channelInApp: boolean;
        channelEmail: boolean;
        channelPush: boolean;
        digestMode: string;
      }
    >;
    catalog: Record<string, PortalNotificationCatalogEntry>;
  };
}

/** Maps digestMode DB string to DigestFrequency union for the selector */
function toDigestFrequency(digestMode: string, channelEmail: boolean): DigestFrequency {
  if (!channelEmail && digestMode === "none") return "off";
  if (digestMode === "daily") return "daily";
  if (digestMode === "weekly") return "weekly";
  return "none"; // instant delivery
}

type TierGroup = {
  tier: "system-critical" | "high" | "low";
  titleKey: string;
  descriptionKey: string;
  eventTypes: string[];
};

export function NotificationPreferencesPageContent() {
  const t = useTranslations("Portal.notificationPreferences");

  const [preferences, setPreferences] = useState<Record<string, CategoryPreference>>({});
  const [digestModes, setDigestModes] = useState<Record<string, DigestFrequency>>({});
  const [catalog, setCatalog] = useState<Record<string, PortalNotificationCatalogEntry>>({});
  const [quietHours, setQuietHours] = useState<QuietHoursValues>({
    start: null,
    end: null,
    timezone: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [prefsRes, quietRes] = await Promise.all([
          fetch("/api/v1/notifications/preferences"),
          fetch("/api/v1/notifications/quiet-hours"),
        ]);
        if (!prefsRes.ok || !quietRes.ok) throw new Error("Failed to fetch");

        const prefsBody = (await prefsRes.json()) as PreferencesApiResponse;
        const quietBody = (await quietRes.json()) as { data: QuietHoursValues };

        if (!cancelled) {
          const prefs: Record<string, CategoryPreference> = {};
          const modes: Record<string, DigestFrequency> = {};
          for (const [eventType, pref] of Object.entries(prefsBody.data.preferences)) {
            prefs[eventType] = {
              channelInApp: pref.channelInApp,
              channelPush: pref.channelPush,
              channelEmail: pref.channelEmail,
            };
            // For low-priority events at catalog defaults (email=false, digestMode="none"),
            // show "Daily Digest" per spec AC #5 rather than "Off" (the raw mapping).
            // When the user saves, the real preference will be written.
            const rawFrequency = toDigestFrequency(pref.digestMode, pref.channelEmail);
            modes[eventType] =
              isLowPriority(eventType) && rawFrequency === "off" && pref.digestMode === "none"
                ? "daily"
                : rawFrequency;
          }
          setPreferences(prefs);
          setDigestModes(modes);
          setCatalog(prefsBody.data.catalog);
          setQuietHours(quietBody.data);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleToggle(
    eventType: string,
    channel: "inApp" | "push" | "email",
    value: boolean,
  ) {
    const channelKey =
      channel === "inApp" ? "channelInApp" : channel === "push" ? "channelPush" : "channelEmail";

    // Optimistic update
    setPreferences((prev) => ({
      ...prev,
      [eventType]: {
        ...(prev[eventType] ?? { channelInApp: false, channelPush: false, channelEmail: false }),
        [channelKey]: value,
      },
    }));

    try {
      const res = await fetch("/api/v1/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType, [channelKey]: value }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(t("saveSuccess"));
    } catch {
      // Revert optimistic update
      setPreferences((prev) => ({
        ...prev,
        [eventType]: {
          ...(prev[eventType] ?? { channelInApp: false, channelPush: false, channelEmail: false }),
          [channelKey]: !value,
        },
      }));
      toast.error(t("saveError"));
    }
  }

  async function handleDigestFrequencyChange(eventType: string, frequency: DigestFrequency) {
    // Capture previous values before optimistic update for correct revert
    const previousFrequency = digestModes[eventType] ?? "none";
    const previousEmail = preferences[eventType]?.channelEmail ?? false;

    // Optimistic update
    setDigestModes((prev) => ({ ...prev, [eventType]: frequency }));

    // Map frequency back to digestMode + channelEmail
    const digestMode = frequency === "none" || frequency === "off" ? "none" : frequency;
    const channelEmail = frequency !== "off";

    // Also update channelEmail in preferences state
    setPreferences((prev) => ({
      ...prev,
      [eventType]: {
        ...(prev[eventType] ?? { channelInApp: true, channelPush: false, channelEmail: false }),
        channelEmail,
      },
    }));

    try {
      const res = await fetch("/api/v1/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType, digestMode, channelEmail }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(t("digest.digestPreferenceUpdated"));
    } catch {
      // Revert optimistic updates to captured pre-change values
      setDigestModes((prev) => ({ ...prev, [eventType]: previousFrequency }));
      setPreferences((prev) => ({
        ...prev,
        [eventType]: {
          ...(prev[eventType] ?? { channelInApp: true, channelPush: false, channelEmail: false }),
          channelEmail: previousEmail,
        },
      }));
      toast.error(t("saveError"));
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-3xl mx-auto" aria-live="polite" aria-busy="true">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3" />
          <div className="h-4 bg-muted rounded w-2/3" />
          <div className="h-32 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <p className="text-destructive">{t("loadError")}</p>
      </div>
    );
  }

  // Group events by tier
  const tierGroups: TierGroup[] = [
    {
      tier: "system-critical",
      titleKey: "tierSystemCritical",
      descriptionKey: "tierSystemCriticalDescription",
      eventTypes: Object.entries(catalog)
        .filter(([, entry]) => entry.priorityTier === "system-critical")
        .map(([key]) => key),
    },
    {
      tier: "high",
      titleKey: "tierHighPriority",
      descriptionKey: "tierHighPriorityDescription",
      eventTypes: Object.entries(catalog)
        .filter(([, entry]) => entry.priorityTier === "high")
        .map(([key]) => key),
    },
    {
      tier: "low",
      titleKey: "tierLowPriority",
      descriptionKey: "tierLowPriorityDescription",
      eventTypes: Object.entries(catalog)
        .filter(([, entry]) => entry.priorityTier === "low")
        .map(([key]) => key),
    },
  ];

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("pageTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("pageDescription")}</p>
        <p className="text-xs text-muted-foreground mt-1">{t("pushRequiresDevice")}</p>
      </div>

      {/* Tier sections */}
      {tierGroups.map((group) => (
        <section key={group.tier} aria-labelledby={`tier-${group.tier}`} className="space-y-2">
          <div>
            <h2
              id={`tier-${group.tier}`}
              className="text-lg font-semibold text-foreground"
              data-testid={`tier-${group.tier}`}
            >
              {t(group.titleKey)}
            </h2>
            <p className="text-sm text-muted-foreground">{t(group.descriptionKey)}</p>
          </div>

          <div className="rounded-md border border-border bg-card px-4">
            {group.eventTypes.map((eventType) => {
              const catalogEntry = catalog[eventType];
              const pref = preferences[eventType];
              if (!catalogEntry || !pref) return null;

              const labelKey =
                EVENT_TYPE_LABEL_MAP[eventType as PortalNotificationEventType] ?? "pageTitle";
              const descriptionKey =
                EVENT_TYPE_DESCRIPTION_MAP[eventType as PortalNotificationEventType];

              const currentFrequency = digestModes[eventType] ?? "none";

              return (
                <div key={eventType}>
                  <NotificationCategoryRow
                    eventType={eventType}
                    catalogEntry={catalogEntry}
                    preference={pref}
                    onToggle={handleToggle}
                    labelKey={labelKey}
                    descriptionKey={descriptionKey}
                  />
                  {isLowPriority(eventType) && (
                    <div className="pl-0 pb-3 border-b border-border last:border-0">
                      <DigestFrequencySelector
                        value={currentFrequency}
                        onChange={(freq) => void handleDigestFrequencyChange(eventType, freq)}
                        ariaLabel={t(labelKey)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* Quiet Hours */}
      <QuietHoursSection initialValues={quietHours} />
    </div>
  );
}
