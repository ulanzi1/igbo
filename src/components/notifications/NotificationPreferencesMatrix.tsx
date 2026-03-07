"use client";
import { useTranslations } from "next-intl";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ChannelPrefs } from "@/lib/notification-constants";
import { DEFAULT_PREFERENCES } from "@/lib/notification-constants";

const CONFIGURABLE_TYPES = [
  "message",
  "mention",
  "group_activity",
  "event_reminder",
  "post_interaction",
  "admin_announcement",
] as const;

type ConfigurableType = (typeof CONFIGURABLE_TYPES)[number];
type DigestMode = "none" | "daily" | "weekly";

async function fetchPreferences(): Promise<Record<string, ChannelPrefs>> {
  const res = await fetch("/api/v1/user/notification-preferences", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch");
  const json = (await res.json()) as { data: { preferences: Record<string, ChannelPrefs> } };
  return json.data.preferences;
}

async function savePreference(body: {
  notificationType: string;
  channelEmail?: boolean;
  channelPush?: boolean;
  digestMode?: DigestMode;
}): Promise<void> {
  const res = await fetch("/api/v1/user/notification-preferences", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to save");
}

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange?: (val: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => !disabled && onChange?.(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-indigo-600" : "bg-gray-200"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export function NotificationPreferencesMatrix() {
  const t = useTranslations("Notifications");
  const queryClient = useQueryClient();

  const { data: prefs = {}, isLoading } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: fetchPreferences,
  });

  const mutation = useMutation({
    mutationFn: savePreference,
    onMutate: async (newPref) => {
      await queryClient.cancelQueries({ queryKey: ["notification-preferences"] });
      const previous = queryClient.getQueryData<Record<string, ChannelPrefs>>([
        "notification-preferences",
      ]);
      queryClient.setQueryData<Record<string, ChannelPrefs>>(
        ["notification-preferences"],
        (old = {}) => ({
          ...old,
          [newPref.notificationType]: {
            ...(old[newPref.notificationType] ?? {
              channelInApp: true,
              channelEmail:
                DEFAULT_PREFERENCES[newPref.notificationType as ConfigurableType]?.email ?? false,
              channelPush:
                DEFAULT_PREFERENCES[newPref.notificationType as ConfigurableType]?.push ?? false,
              digestMode: "none",
              quietHoursStart: null,
              quietHoursEnd: null,
              quietHoursTimezone: "UTC",
              lastDigestAt: null,
            }),
            ...(newPref.channelEmail !== undefined && { channelEmail: newPref.channelEmail }),
            ...(newPref.channelPush !== undefined && { channelPush: newPref.channelPush }),
            ...(newPref.digestMode !== undefined && { digestMode: newPref.digestMode }),
          },
        }),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["notification-preferences"], context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
    },
  });

  function getEmailEnabled(type: ConfigurableType): boolean {
    const pref = prefs[type];
    return pref?.channelEmail ?? DEFAULT_PREFERENCES[type].email;
  }

  function getPushEnabled(type: ConfigurableType): boolean {
    const pref = prefs[type];
    return pref?.channelPush ?? DEFAULT_PREFERENCES[type].push;
  }

  function getDigestMode(type: ConfigurableType): DigestMode {
    const pref = prefs[type];
    const mode = pref?.digestMode ?? "none";
    return (["none", "daily", "weekly"].includes(mode) ? mode : "none") as DigestMode;
  }

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">{t("loading")}</div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("preferences.matrixDescription")}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2 text-left font-medium w-40">{/* type column */}</th>
              <th className="py-2 text-center font-medium px-4">{t("channels.in_app")}</th>
              <th className="py-2 text-center font-medium px-4">{t("channels.email")}</th>
              <th className="py-2 text-center font-medium px-4">{t("channels.push")}</th>
            </tr>
          </thead>
          <tbody>
            {CONFIGURABLE_TYPES.map((type) => (
              <tr key={type} className="border-b last:border-0">
                <td className="py-3 pr-4 font-medium text-sm text-gray-800">
                  {t(`types.${type}`)}
                </td>
                {/* In-app: always on, non-editable */}
                <td className="py-3 text-center px-4">
                  <div className="flex flex-col items-center gap-1">
                    <Toggle checked={true} disabled={true} label={t("channels.in_app_always")} />
                    <span className="text-xs text-muted-foreground">
                      {t("channels.in_app_always")}
                    </span>
                  </div>
                </td>
                {/* Email */}
                <td className="py-3 text-center px-4">
                  <div className="flex flex-col items-center gap-1">
                    <Toggle
                      checked={getEmailEnabled(type)}
                      onChange={(val) =>
                        mutation.mutate({ notificationType: type, channelEmail: val })
                      }
                      label={`${t(`types.${type}`)} ${t("channels.email")}`}
                    />
                    <select
                      value={getDigestMode(type)}
                      onChange={(e) =>
                        mutation.mutate({
                          notificationType: type,
                          digestMode: e.target.value as DigestMode,
                        })
                      }
                      className="text-xs border rounded px-1 py-0.5 mt-1 bg-white"
                      aria-label={`${t(`types.${type}`)} ${t("digest.label")}`}
                    >
                      <option value="none">{t("digest.none")}</option>
                      <option value="daily">{t("digest.daily")}</option>
                      <option value="weekly">{t("digest.weekly")}</option>
                    </select>
                  </div>
                </td>
                {/* Push */}
                <td className="py-3 text-center px-4">
                  <Toggle
                    checked={getPushEnabled(type)}
                    onChange={(val) =>
                      mutation.mutate({ notificationType: type, channelPush: val })
                    }
                    label={`${t(`types.${type}`)} ${t("channels.push")}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
