CREATE TABLE IF NOT EXISTS "platform_notification_preferences" (
  "user_id" text NOT NULL REFERENCES "auth_users"("id") ON DELETE CASCADE,
  "notification_type" text NOT NULL,
  "channel_in_app" boolean NOT NULL DEFAULT true,
  "channel_email" boolean NOT NULL DEFAULT false,
  "channel_push" boolean NOT NULL DEFAULT false,
  "digest_mode" text NOT NULL DEFAULT 'none',
  "quiet_hours_start" time,
  "quiet_hours_end" time,
  "quiet_hours_timezone" text NOT NULL DEFAULT 'UTC',
  "last_digest_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("user_id", "notification_type")
);
CREATE INDEX IF NOT EXISTS "notif_prefs_user_idx" ON "platform_notification_preferences" ("user_id");
