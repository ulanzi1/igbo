-- Migration: 0045_analytics_snapshots
-- Creates platform_analytics_snapshots table for nightly aggregation snapshots

CREATE TYPE "analytics_metric_type" AS ENUM (
  'dau',
  'mau',
  'registrations',
  'approvals',
  'net_growth',
  'posts',
  'messages',
  'articles',
  'events',
  'avg_event_attendance',
  'active_by_tier',
  'active_by_country',
  'top_content'
);

CREATE TABLE "platform_analytics_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "metric_type" "analytics_metric_type" NOT NULL,
  "metric_date" date NOT NULL,
  "metric_value" integer NOT NULL DEFAULT 0,
  "metadata" jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "uq_analytics_metric_type_date" UNIQUE ("metric_type", "metric_date")
);
