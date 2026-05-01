"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { PortalNotificationCatalogEntry } from "@igbo/config/notifications";
import { isHighPriority } from "@igbo/config/notifications";

export interface CategoryPreference {
  channelInApp: boolean;
  channelPush: boolean;
  channelEmail: boolean;
}

interface NotificationCategoryRowProps {
  eventType: string;
  catalogEntry: PortalNotificationCatalogEntry;
  preference: CategoryPreference;
  onToggle: (
    eventType: string,
    channel: "inApp" | "push" | "email",
    value: boolean,
  ) => Promise<void>;
  labelKey: string;
  descriptionKey?: string;
}

export function NotificationCategoryRow({
  eventType,
  catalogEntry,
  preference,
  onToggle,
  labelKey,
  descriptionKey,
}: NotificationCategoryRowProps) {
  const t = useTranslations("Portal.notificationPreferences");
  const isDisabled = catalogEntry.priorityTier === "system-critical";

  async function handleToggle(channel: "inApp" | "push" | "email", newValue: boolean) {
    // At-least-one-channel guard (client-side only, high-priority events)
    if (!newValue && isHighPriority(eventType)) {
      const simulated = {
        ...preference,
        [channel === "inApp"
          ? "channelInApp"
          : channel === "push"
            ? "channelPush"
            : "channelEmail"]: false,
      };
      if (!simulated.channelInApp && !simulated.channelPush && !simulated.channelEmail) {
        toast.error(t("atLeastOneRequired"));
        return; // revert — don't send PUT
      }
    }
    await onToggle(eventType, channel, newValue);
  }

  const ToggleRow = (
    <div
      data-testid={`category-row-${eventType}`}
      className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-0"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground truncate">{t(labelKey)}</p>
          {catalogEntry.reserved && (
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {t("reservedLabel")}
            </span>
          )}
        </div>
        {descriptionKey && (
          <p className="text-xs text-muted-foreground mt-0.5">{t(descriptionKey)}</p>
        )}
      </div>

      <div className="flex items-center gap-4 shrink-0">
        {/* In-App */}
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs text-muted-foreground">{t("channelInApp")}</span>
          <Switch
            checked={preference.channelInApp}
            disabled={isDisabled}
            onCheckedChange={(val) => void handleToggle("inApp", val)}
            aria-label={`${t(labelKey)} ${t("channelInApp")}`}
            data-testid={`toggle-${eventType}-inApp`}
          />
        </div>

        {/* Push */}
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs text-muted-foreground">{t("channelPush")}</span>
          <Switch
            checked={preference.channelPush}
            disabled={isDisabled}
            onCheckedChange={(val) => void handleToggle("push", val)}
            aria-label={`${t(labelKey)} ${t("channelPush")}`}
            data-testid={`toggle-${eventType}-push`}
          />
        </div>

        {/* Email */}
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs text-muted-foreground">{t("channelEmail")}</span>
          <Switch
            checked={preference.channelEmail}
            disabled={isDisabled}
            onCheckedChange={(val) => void handleToggle("email", val)}
            aria-label={`${t(labelKey)} ${t("channelEmail")}`}
            data-testid={`toggle-${eventType}-email`}
          />
        </div>
      </div>
    </div>
  );

  if (isDisabled) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>{ToggleRow}</div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t("systemCriticalTooltip")}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return ToggleRow;
}
