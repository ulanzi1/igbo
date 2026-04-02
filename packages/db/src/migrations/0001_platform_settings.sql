-- Create platform_settings table
-- key: text primary key, value: JSONB, description: text, updated_by: UUID FK (nullable), updated_at: timestamp
-- Note: updated_by FK → auth_users.id will be enforced once auth_users schema is added (Story 1.2+)
CREATE TABLE IF NOT EXISTS "platform_settings" (
  "key" text PRIMARY KEY NOT NULL,
  "value" jsonb NOT NULL,
  "description" text,
  "updated_by" uuid,
  "updated_at" timestamp with time zone DEFAULT now()
);
