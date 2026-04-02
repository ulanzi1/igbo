import {
  pgTable,
  pgEnum,
  uuid,
  integer,
  date,
  jsonb,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const analyticsMetricTypeEnum = pgEnum("analytics_metric_type", [
  "dau",
  "mau",
  "registrations",
  "approvals",
  "net_growth",
  "posts",
  "messages",
  "articles",
  "events",
  "avg_event_attendance",
  "active_by_tier",
  "active_by_country",
  "top_content",
]);

export const platformAnalyticsSnapshots = pgTable(
  "platform_analytics_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    metricType: analyticsMetricTypeEnum("metric_type").notNull(),
    metricDate: date("metric_date").notNull(),
    metricValue: integer("metric_value").notNull().default(0),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique("uq_analytics_metric_type_date").on(t.metricType, t.metricDate)],
);

export type PlatformAnalyticsSnapshot = typeof platformAnalyticsSnapshots.$inferSelect;
export type NewPlatformAnalyticsSnapshot = typeof platformAnalyticsSnapshots.$inferInsert;
