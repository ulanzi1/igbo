DO $$ BEGIN
  CREATE TYPE "membership_tier" AS ENUM ('BASIC', 'PROFESSIONAL', 'TOP_TIER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "auth_users" ADD COLUMN IF NOT EXISTS "membership_tier" "membership_tier" NOT NULL DEFAULT 'BASIC';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_auth_users_membership_tier" ON "auth_users" ("membership_tier");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(50) NOT NULL UNIQUE,
  "description" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "auth_roles" ("name", "description") VALUES
  ('MEMBER', 'Standard community member'),
  ('ADMIN', 'Platform administrator'),
  ('MODERATOR', 'Content moderator')
ON CONFLICT ("name") DO NOTHING;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_user_roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "auth_users"("id") ON DELETE CASCADE,
  "role_id" uuid NOT NULL REFERENCES "auth_roles"("id") ON DELETE CASCADE,
  "assigned_by" uuid REFERENCES "auth_users"("id"),
  "assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unq_auth_user_roles_user_role" ON "auth_user_roles" ("user_id", "role_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_auth_user_roles_user_id" ON "auth_user_roles" ("user_id");
