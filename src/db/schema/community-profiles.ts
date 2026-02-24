import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";

export const communityProfiles = pgTable(
  "community_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => authUsers.id, { onDelete: "cascade" }),

    // Display fields
    displayName: varchar("display_name", { length: 255 }).notNull(),
    bio: text("bio"),
    photoUrl: varchar("photo_url", { length: 2048 }),

    // Location fields
    locationCity: varchar("location_city", { length: 255 }),
    locationState: varchar("location_state", { length: 255 }),
    locationCountry: varchar("location_country", { length: 255 }),
    locationLat: numeric("location_lat", { precision: 10, scale: 8 }),
    locationLng: numeric("location_lng", { precision: 11, scale: 8 }),

    // Array fields (PostgreSQL native arrays)
    interests: text("interests").array().notNull().default([]),
    culturalConnections: text("cultural_connections").array().notNull().default([]),
    languages: text("languages").array().notNull().default([]),

    // Onboarding status timestamps
    profileCompletedAt: timestamp("profile_completed_at", { withTimezone: true }),
    guidelinesAcknowledgedAt: timestamp("guidelines_acknowledged_at", { withTimezone: true }),
    tourCompletedAt: timestamp("tour_completed_at", { withTimezone: true }),
    tourSkippedAt: timestamp("tour_skipped_at", { withTimezone: true }),

    // GDPR soft-delete
    deletedAt: timestamp("deleted_at", { withTimezone: true }),

    // Audit timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("unq_community_profiles_user_id").on(t.userId),
    index("idx_community_profiles_location_country").on(t.locationCountry),
    index("idx_community_profiles_location_state").on(t.locationState),
    index("idx_community_profiles_location_city").on(t.locationCity),
    index("idx_community_profiles_profile_completed_at").on(t.profileCompletedAt),
  ],
);

export type CommunityProfile = typeof communityProfiles.$inferSelect;
export type NewCommunityProfile = typeof communityProfiles.$inferInsert;
