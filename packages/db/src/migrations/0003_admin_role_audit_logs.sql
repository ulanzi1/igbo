-- Create user_role enum
CREATE TYPE "user_role" AS ENUM ('MEMBER', 'ADMIN', 'MODERATOR');

-- Add role column to auth_users (default MEMBER)
ALTER TABLE "auth_users" ADD COLUMN "role" "user_role" DEFAULT 'MEMBER' NOT NULL;

-- Add admin_notes column to auth_users
ALTER TABLE "auth_users" ADD COLUMN "admin_notes" text;

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_id" uuid NOT NULL REFERENCES "auth_users"("id"),
  "action" varchar(100) NOT NULL,
  "target_user_id" uuid,
  "details" jsonb,
  "ip_address" varchar(45),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "idx_audit_logs_actor_id" ON "audit_logs" ("actor_id");
CREATE INDEX "idx_audit_logs_target_user_id" ON "audit_logs" ("target_user_id");
CREATE INDEX "idx_audit_logs_created_at" ON "audit_logs" ("created_at");
