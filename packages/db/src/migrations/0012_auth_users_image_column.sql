-- Add missing image column to auth_users
-- This column was added to the Drizzle schema but omitted from all prior migrations.
ALTER TABLE "auth_users"
ADD COLUMN IF NOT EXISTS "image" text;
