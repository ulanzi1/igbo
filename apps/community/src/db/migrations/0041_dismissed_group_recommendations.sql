CREATE TABLE IF NOT EXISTS "platform_dismissed_group_recommendations" (
  "user_id" uuid NOT NULL REFERENCES "auth_users"("id") ON DELETE CASCADE,
  "group_id" uuid NOT NULL REFERENCES "community_groups"("id") ON DELETE CASCADE,
  "dismissed_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "group_id")
);

CREATE INDEX IF NOT EXISTS "dismissed_recs_user_idx" ON "platform_dismissed_group_recommendations" ("user_id");
