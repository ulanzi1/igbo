DO $$ BEGIN
  CREATE TYPE "profile_visibility_enum" AS ENUM ('PUBLIC_TO_MEMBERS', 'LIMITED', 'PRIVATE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "social_provider_enum" AS ENUM ('FACEBOOK', 'LINKEDIN', 'TWITTER', 'INSTAGRAM');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "community_profiles" ADD COLUMN IF NOT EXISTS "profile_visibility" "profile_visibility_enum" NOT NULL DEFAULT 'PUBLIC_TO_MEMBERS';
--> statement-breakpoint
ALTER TABLE "community_profiles" ADD COLUMN IF NOT EXISTS "location_visible" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_social_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "auth_users"("id") ON DELETE CASCADE,
  "provider" "social_provider_enum" NOT NULL,
  "provider_display_name" varchar(255) NOT NULL,
  "provider_profile_url" varchar(2048) NOT NULL,
  "linked_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unq_community_social_links_user_provider" ON "community_social_links" ("user_id", "provider");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_community_social_links_user_id" ON "community_social_links" ("user_id");
