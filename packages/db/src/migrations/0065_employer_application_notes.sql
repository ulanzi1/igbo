-- P-2.10: Employer Notes & Bulk Actions
-- Private notes table for employers to record candidate evaluations during
-- the ATS pipeline review. Notes are immutable (append-only) and scoped to
-- the owning company via the application_id → job → company chain.

CREATE TABLE IF NOT EXISTS "portal_application_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "application_id" uuid NOT NULL REFERENCES "portal_applications"("id") ON DELETE CASCADE,
  "author_user_id" uuid NOT NULL REFERENCES "auth_users"("id") ON DELETE RESTRICT,
  "content" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_application_notes_app_id_created_idx"
  ON "portal_application_notes" ("application_id", "created_at" ASC);
