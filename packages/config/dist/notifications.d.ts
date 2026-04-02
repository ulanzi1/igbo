declare const NOTIFICATION_TYPES: readonly [
  "message",
  "mention",
  "group_activity",
  "event_reminder",
  "post_interaction",
  "admin_announcement",
  "system",
];
type NotificationTypeKey = (typeof NOTIFICATION_TYPES)[number];
interface ChannelPrefs {
  channelInApp: boolean;
  channelEmail: boolean;
  channelPush: boolean;
  digestMode: string;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  quietHoursTimezone: string;
  lastDigestAt: Date | null;
}
declare const DEFAULT_PREFERENCES: Record<
  NotificationTypeKey,
  {
    inApp: boolean;
    email: boolean;
    push: boolean;
  }
>;

export { type ChannelPrefs, DEFAULT_PREFERENCES, NOTIFICATION_TYPES, type NotificationTypeKey };
