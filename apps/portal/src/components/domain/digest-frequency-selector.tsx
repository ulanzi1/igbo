"use client";

import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** The four digest frequency options for low-priority notification categories. */
export type DigestFrequency = "none" | "daily" | "weekly" | "off";

export interface DigestFrequencySelectorProps {
  /** Current digest frequency value for this notification category */
  value: DigestFrequency;
  /** Called when user selects a new frequency */
  onChange: (value: DigestFrequency) => void;
  /** Whether the selector is disabled (e.g., while saving) */
  disabled?: boolean;
  /** Accessible label (usually the category name) for aria-label */
  ariaLabel?: string;
}

/**
 * Frequency selector dropdown for low-priority notification categories.
 * Renders the four frequency options: Instant, Daily Digest, Weekly Digest, Off.
 *
 * Only render this for low-priority categories — high/system-critical categories
 * show the channel toggles only (from NotificationCategoryRow).
 *
 * Options and their semantics:
 *   "none"   → Instant (deliver email immediately on each event)
 *   "daily"  → Daily Digest (batch into daily email — the low-priority default)
 *   "weekly" → Weekly Digest (batch into weekly Monday email)
 *   "off"    → Off (no email at all; also sets channelEmail=false)
 */
export function DigestFrequencySelector({
  value,
  onChange,
  disabled = false,
  ariaLabel,
}: DigestFrequencySelectorProps) {
  const t = useTranslations("Portal.digest");

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{t("frequencyLabel")}</span>
      <Select
        value={value}
        onValueChange={(v) => onChange(v as DigestFrequency)}
        disabled={disabled}
      >
        <SelectTrigger
          size="sm"
          aria-label={ariaLabel ? `${ariaLabel} ${t("frequencyLabel")}` : t("frequencyLabel")}
          data-testid="digest-frequency-selector"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none" data-testid="frequency-option-none">
            {t("frequencyInstant")}
          </SelectItem>
          <SelectItem value="daily" data-testid="frequency-option-daily">
            {t("frequencyDaily")}
          </SelectItem>
          <SelectItem value="weekly" data-testid="frequency-option-weekly">
            {t("frequencyWeekly")}
          </SelectItem>
          <SelectItem value="off" data-testid="frequency-option-off">
            {t("frequencyOff")}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
