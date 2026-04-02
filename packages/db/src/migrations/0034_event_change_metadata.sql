CREATE TYPE "date_change_type_enum" AS ENUM ('postponed', 'preponed');

ALTER TABLE "community_events"
  ADD COLUMN "cancellation_reason" TEXT,
  ADD COLUMN "date_change_type" "date_change_type_enum",
  ADD COLUMN "date_change_comment" TEXT;
