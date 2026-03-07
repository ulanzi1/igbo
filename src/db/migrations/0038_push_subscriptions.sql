CREATE TABLE IF NOT EXISTS "platform_push_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL REFERENCES "auth_users"("id") ON DELETE CASCADE,
  "endpoint" text NOT NULL UNIQUE,
  "keys_p256dh" text NOT NULL,
  "keys_auth" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "push_subs_user_idx" ON "platform_push_subscriptions" ("user_id");
