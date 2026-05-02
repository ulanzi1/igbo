-- P-6.7: Portal Notifications table for notification store & read state management
CREATE TABLE IF NOT EXISTS "portal_notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "auth_users"("id") ON DELETE CASCADE,
  "event_type" varchar(100) NOT NULL,
  "title" varchar(255) NOT NULL,
  "body" text NOT NULL,
  "link" text,
  "payload_json" jsonb,
  "read_at" timestamp with time zone,
  "dismissed_at" timestamp with time zone,
  "idempotency_key" varchar(255),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Efficient notification center queries: list unread first, ordered by newest
CREATE INDEX "idx_portal_notifications_user_read_created"
  ON "portal_notifications" ("user_id", "read_at", "created_at" DESC);

-- Exclude dismissed notifications from list/count queries
CREATE INDEX "idx_portal_notifications_user_dismissed"
  ON "portal_notifications" ("user_id", "dismissed_at");

-- Idempotency deduplication (partial unique: only non-null keys)
CREATE UNIQUE INDEX "idx_portal_notifications_idempotency_key"
  ON "portal_notifications" ("idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
