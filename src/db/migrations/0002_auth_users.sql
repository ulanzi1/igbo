-- Create account_status enum
CREATE TYPE "account_status" AS ENUM (
  'PENDING_EMAIL_VERIFICATION',
  'PENDING_APPROVAL',
  'INFO_REQUESTED',
  'APPROVED',
  'REJECTED',
  'SUSPENDED',
  'BANNED'
);

-- Create auth_users table
CREATE TABLE IF NOT EXISTS "auth_users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(255) NOT NULL,
  "email_verified" timestamp with time zone,
  "name" varchar(255),
  "phone" varchar(20),
  "location_city" varchar(255),
  "location_state" varchar(255),
  "location_country" varchar(255),
  "cultural_connection" text,
  "reason_for_joining" text,
  "referral_name" varchar(255),
  "consent_given_at" timestamp with time zone NOT NULL,
  "consent_ip" varchar(45),
  "consent_version" varchar(20),
  "account_status" "account_status" DEFAULT 'PENDING_EMAIL_VERIFICATION' NOT NULL,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "unq_auth_users_email" ON "auth_users" ("email");

-- Create auth_verification_tokens table
CREATE TABLE IF NOT EXISTS "auth_verification_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "auth_users"("id"),
  "token_hash" varchar(64) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone
);

CREATE INDEX "idx_auth_verification_tokens_token_hash" ON "auth_verification_tokens" ("token_hash");
CREATE INDEX "idx_auth_verification_tokens_user_expires" ON "auth_verification_tokens" ("user_id", "expires_at");
