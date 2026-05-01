"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Timezone list — grouped by region, generated from Intl at module load time.
// Falls back to a curated list if the API is unavailable (older environments).
// ---------------------------------------------------------------------------
const FALLBACK_TIMEZONES = [
  "UTC",
  "Africa/Abidjan",
  "Africa/Lagos",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "America/Toronto",
  "America/Vancouver",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Pacific/Auckland",
  "Pacific/Honolulu",
];

function getAllTimezones(): string[] {
  try {
    if (typeof Intl !== "undefined" && "supportedValuesOf" in Intl) {
      return (Intl as { supportedValuesOf: (key: string) => string[] }).supportedValuesOf(
        "timeZone",
      );
    }
  } catch {
    // ignore
  }
  return FALLBACK_TIMEZONES;
}

interface TimezoneGroup {
  label: string;
  zones: string[];
}

function groupTimezones(zones: string[]): TimezoneGroup[] {
  const groups: Record<string, string[]> = {};
  for (const tz of zones) {
    const prefix = tz.includes("/") ? tz.split("/")[0] : "Other";
    (groups[prefix] ??= []).push(tz);
  }
  const order = [
    "Africa",
    "America",
    "Asia",
    "Atlantic",
    "Australia",
    "Europe",
    "Indian",
    "Pacific",
    "UTC",
    "Other",
  ];
  return order.filter((k) => groups[k]?.length).map((k) => ({ label: k, zones: groups[k] }));
}

const TIMEZONE_GROUPS = groupTimezones(getAllTimezones());

// ---------------------------------------------------------------------------
// QuietHoursSection
// ---------------------------------------------------------------------------
export interface QuietHoursValues {
  start: string | null;
  end: string | null;
  timezone: string | null;
}

interface QuietHoursSectionProps {
  initialValues: QuietHoursValues;
}

export function QuietHoursSection({ initialValues }: QuietHoursSectionProps) {
  const t = useTranslations("Portal.notificationPreferences.quietHours");

  const defaultTimezone =
    typeof Intl !== "undefined" && Intl.DateTimeFormat
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "UTC";

  const [start, setStart] = useState(initialValues.start ?? "");
  const [end, setEnd] = useState(initialValues.end ?? "");
  const [timezone, setTimezone] = useState(initialValues.timezone ?? defaultTimezone);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/v1/notifications/quiet-hours", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: start || null,
          end: end || null,
          timezone,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(t("saveSuccess"));
    } catch {
      toast.error(t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    try {
      const res = await fetch("/api/v1/notifications/quiet-hours", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: null, end: null, timezone }),
      });
      if (!res.ok) throw new Error("Failed");
      setStart("");
      setEnd("");
      setTimezone(defaultTimezone);
      toast.success(t("saveSuccess"));
    } catch {
      toast.error(t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="quiet-hours-heading" className="mt-8 space-y-4">
      <div>
        <h2 id="quiet-hours-heading" className="text-lg font-semibold text-foreground">
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">{t("description")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Start time */}
        <div className="flex flex-col gap-1">
          <label htmlFor="quiet-hours-start" className="text-sm font-medium text-foreground">
            {t("start")}
          </label>
          <div className="relative">
            <input
              id="quiet-hours-start"
              type="time"
              step="60"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="w-full border border-input rounded-md pl-3 pr-9 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              data-testid="quiet-hours-start"
            />
            <Clock
              className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
              aria-hidden="true"
            />
          </div>
        </div>

        {/* End time */}
        <div className="flex flex-col gap-1">
          <label htmlFor="quiet-hours-end" className="text-sm font-medium text-foreground">
            {t("end")}
          </label>
          <div className="relative">
            <input
              id="quiet-hours-end"
              type="time"
              step="60"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="w-full border border-input rounded-md pl-3 pr-9 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              data-testid="quiet-hours-end"
            />
            <Clock
              className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
              aria-hidden="true"
            />
          </div>
        </div>

        {/* Timezone */}
        <div className="flex flex-col gap-1">
          <label htmlFor="quiet-hours-timezone" className="text-sm font-medium text-foreground">
            {t("timezone")}
          </label>
          <select
            id="quiet-hours-timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="border border-input rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            data-testid="quiet-hours-timezone"
          >
            {TIMEZONE_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.zones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz.replace(/_/g, " ")}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          onClick={() => void handleSave()}
          disabled={saving}
          data-testid="quiet-hours-save"
          size="sm"
        >
          {t("save")}
        </Button>
        <Button
          variant="outline"
          onClick={() => void handleClear()}
          disabled={saving}
          data-testid="quiet-hours-clear"
          size="sm"
        >
          {t("clear")}
        </Button>
      </div>
    </section>
  );
}
