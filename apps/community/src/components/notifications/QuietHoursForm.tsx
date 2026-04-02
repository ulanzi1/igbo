"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";

// Common timezones list
const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Vancouver",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Africa/Lagos",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "Africa/Accra",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
  "Pacific/Auckland",
];

interface QuietHoursFormProps {
  onSaved?: () => void;
}

export function QuietHoursForm({ onSaved }: QuietHoursFormProps) {
  const t = useTranslations("Notifications.quietHours");

  const [enabled, setEnabled] = useState(false);
  const [start, setStart] = useState("22:00");
  const [end, setEnd] = useState("08:00");
  const [timezone, setTimezone] = useState(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return COMMON_TIMEZONES.includes(detected) ? detected : "UTC";
    } catch {
      return "UTC";
    }
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [savedValues, setSavedValues] = useState({ start: "22:00", end: "08:00", timezone: "UTC" });

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/user/notification-preferences/quiet-hours", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quietHoursStart: start,
          quietHoursEnd: end,
          quietHoursTimezone: timezone,
        }),
      });
      if (!res.ok) throw new Error("save failed");
      setSaved(true);
      setSavedValues({ start, end, timezone });
      onSaved?.();
    } catch {
      setError(t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDisable() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/user/notification-preferences/quiet-hours", {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("disable failed");
      setEnabled(false);
      setSaved(false);
      onSaved?.();
    } catch {
      setError(t("disableError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              setEnabled(e.target.checked);
              if (!e.target.checked) void handleDisable();
            }}
            className="h-4 w-4 rounded border-gray-300"
            aria-label={t("enableLabel")}
          />
          <span className="text-sm font-medium">{t("enableLabel")}</span>
        </label>
      </div>

      {enabled && saved && (
        <div className="pl-6 text-sm text-muted-foreground">
          <span>
            {t("savedSummary")} · {savedValues.start} → {savedValues.end} ({savedValues.timezone})
          </span>
          {" · "}
          <button
            type="button"
            onClick={() => setSaved(false)}
            className="text-indigo-600 hover:underline text-sm"
          >
            {t("editButton")}
          </button>
        </div>
      )}

      {enabled && !saved && (
        <div className="space-y-3 pl-6">
          <p className="text-xs text-muted-foreground">{t("description")}</p>
          <div className="flex flex-wrap gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">{t("startLabel")}</label>
              <input
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="block border rounded px-2 py-1 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">{t("endLabel")}</label>
              <input
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="block border rounded px-2 py-1 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700" htmlFor="quiet-hours-timezone">
                {t("timezoneLabel")}
              </label>
              <select
                id="quiet-hours-timezone"
                aria-label={t("timezoneLabel")}
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="block border rounded px-2 py-1 text-sm bg-white"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? "..." : t("saveButton")}
          </button>
        </div>
      )}
    </div>
  );
}
