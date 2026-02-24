import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  numeric,
  timestamp,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";

export const profileVisibilityEnum = pgEnum("profile_visibility_enum", [
  "PUBLIC_TO_MEMBERS",
  "LIMITED",
  "PRIVATE",
]);

export const socialProviderEnum = pgEnum("social_provider_enum", [
  "FACEBOOK",
  "LINKEDIN",
  "TWITTER",
  "INSTAGRAM",
]);

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

    // Privacy settings
    profileVisibility: profileVisibilityEnum("profile_visibility")
      .notNull()
      .default("PUBLIC_TO_MEMBERS"),
    locationVisible: boolean("location_visible").notNull().default(true),

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

export const communitySocialLinks = pgTable(
  "community_social_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    provider: socialProviderEnum("provider").notNull(),
    providerDisplayName: varchar("provider_display_name", { length: 255 }).notNull(),
    providerProfileUrl: varchar("provider_profile_url", { length: 2048 }).notNull(),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("unq_community_social_links_user_provider").on(t.userId, t.provider),
    index("idx_community_social_links_user_id").on(t.userId),
  ],
);

export type CommunitySocialLink = typeof communitySocialLinks.$inferSelect;
export type NewCommunitySocialLink = typeof communitySocialLinks.$inferInsert;
