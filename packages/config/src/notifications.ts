export const NOTIFICATION_TYPES = [
  "message",
  "mention",
  "group_activity",
  "event_reminder",
  "post_interaction",
  "admin_announcement",
  "system",
] as const;

export type NotificationTypeKey = (typeof NOTIFICATION_TYPES)[number];

export interface ChannelPrefs {
  channelInApp: boolean;
  channelEmail: boolean;
  channelPush: boolean;
  digestMode: string;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  quietHoursTimezone: string;
  lastDigestAt: Date | null;
}

export const DEFAULT_PREFERENCES: Record<
  NotificationTypeKey,
  { inApp: boolean; email: boolean; push: boolean }
> = {
  message: { inApp: true, email: true, push: true },
  mention: { inApp: true, email: false, push: true },
  group_activity: { inApp: true, email: false, push: false },
  event_reminder: { inApp: true, email: true, push: true },
  post_interaction: { inApp: true, email: false, push: false },
  admin_announcement: { inApp: true, email: true, push: true },
  system: { inApp: true, email: false, push: false },
};
