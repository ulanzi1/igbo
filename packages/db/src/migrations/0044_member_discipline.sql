-- Migration 0044: member discipline system
-- Adds progressive discipline table for warnings, suspensions, and bans

CREATE TYPE "discipline_action_type" AS ENUM ('warning', 'suspension', 'ban');
CREATE TYPE "discipline_source_type" AS ENUM ('moderation_action', 'report', 'manual');
CREATE TYPE "discipline_status" AS ENUM ('active', 'expired', 'lifted');

CREATE TABLE "member_discipline_actions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "auth_users"("id") ON DELETE CASCADE,
  "moderation_action_id" uuid REFERENCES "platform_moderation_actions"("id") ON DELETE SET NULL,
  "source_type" "discipline_source_type" NOT NULL,
  "action_type" "discipline_action_type" NOT NULL,
  "reason" text NOT NULL,
  "notes" text,
  "suspension_ends_at" timestamptz,
  "issued_by" uuid NOT NULL REFERENCES "auth_users"("id") ON DELETE RESTRICT,
  "status" "discipline_status" NOT NULL DEFAULT 'active',
  "lifted_at" timestamptz,
  "lifted_by" uuid REFERENCES "auth_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX "idx_member_discipline_user_id" ON "member_discipline_actions" ("user_id");
CREATE INDEX "idx_member_discipline_status" ON "member_discipline_actions" ("status");
CREATE INDEX "idx_member_discipline_suspension_ends_at" ON "member_discipline_actions" ("suspension_ends_at");
