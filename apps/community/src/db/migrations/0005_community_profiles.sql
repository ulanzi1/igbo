-- Create community_profiles table
CREATE TABLE IF NOT EXISTS "community_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL UNIQUE REFERENCES "auth_users"("id") ON DELETE CASCADE,

  -- Display fields
  "display_name" varchar(255) NOT NULL,
  "bio" text,
  "photo_url" varchar(2048),

  -- Location fields
  "location_city" varchar(255),
  "location_state" varchar(255),
  "location_country" varchar(255),
  "location_lat" numeric(10, 8),
  "location_lng" numeric(11, 8),

  -- Array fields (PostgreSQL native arrays)
  "interests" text[] NOT NULL DEFAULT '{}',
  "cultural_connections" text[] NOT NULL DEFAULT '{}',
  "languages" text[] NOT NULL DEFAULT '{}',

  -- Onboarding status timestamps
  "profile_completed_at" timestamp with time zone,
  "guidelines_acknowledged_at" timestamp with time zone,
  "tour_completed_at" timestamp with time zone,
  "tour_skipped_at" timestamp with time zone,

  -- GDPR soft-delete
  "deleted_at" timestamp with time zone,

  -- Audit timestamps
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "unq_community_profiles_user_id" ON "community_profiles" ("user_id");
CREATE INDEX "idx_community_profiles_location_country" ON "community_profiles" ("location_country");
CREATE INDEX "idx_community_profiles_location_state" ON "community_profiles" ("location_state");
CREATE INDEX "idx_community_profiles_location_city" ON "community_profiles" ("location_city");
CREATE INDEX "idx_community_profiles_profile_completed_at" ON "community_profiles" ("profile_completed_at");
