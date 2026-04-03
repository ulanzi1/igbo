CREATE TABLE IF NOT EXISTS "platform_posting_limits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tier" varchar(20) NOT NULL,
  "base_limit" integer NOT NULL,
  "points_threshold" integer NOT NULL,
  "bonus_limit" integer NOT NULL
);

-- Seed default posting limits
INSERT INTO "platform_posting_limits" ("tier", "base_limit", "points_threshold", "bonus_limit") VALUES
  ('PROFESSIONAL', 1, 0, 0),
  ('PROFESSIONAL', 1, 500, 1),
  ('PROFESSIONAL', 1, 2000, 2),
  ('TOP_TIER', 2, 0, 0),
  ('TOP_TIER', 2, 1000, 1),
  ('TOP_TIER', 2, 3000, 2),
  ('TOP_TIER', 2, 7500, 3),
  ('TOP_TIER', 2, 15000, 4),
  ('TOP_TIER', 2, 30000, 5);
