-- Add password_hash column to auth_users
ALTER TABLE "auth_users" ADD COLUMN "password_hash" varchar(255);

-- Create auth_sessions table
CREATE TABLE IF NOT EXISTS "auth_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_token" varchar(255) NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "auth_users"("id") ON DELETE CASCADE,
  "expires" timestamp with time zone NOT NULL,
  "device_name" varchar(255),
  "device_ip" varchar(45),
  "device_location" varchar(255),
  "last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "unq_auth_sessions_session_token" ON "auth_sessions" ("session_token");
CREATE INDEX "idx_auth_sessions_user_id" ON "auth_sessions" ("user_id");
CREATE INDEX "idx_auth_sessions_expires" ON "auth_sessions" ("expires");

-- Create auth_totp_secrets table
CREATE TABLE IF NOT EXISTS "auth_totp_secrets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL UNIQUE REFERENCES "auth_users"("id") ON DELETE CASCADE,
  "secret" varchar(32) NOT NULL,
  "recovery_codes" jsonb,
  "verified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "idx_auth_totp_secrets_user_id" ON "auth_totp_secrets" ("user_id");

-- Create auth_password_reset_tokens table
CREATE TABLE IF NOT EXISTS "auth_password_reset_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "auth_users"("id"),
  "token_hash" varchar(64) NOT NULL UNIQUE,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone
);

CREATE INDEX "idx_auth_password_reset_tokens_token_hash" ON "auth_password_reset_tokens" ("token_hash");
CREATE INDEX "idx_auth_password_reset_tokens_user_expires" ON "auth_password_reset_tokens" ("user_id", "expires_at");
