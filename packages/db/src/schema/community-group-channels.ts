// NOTE: Architecture doc suggests group_channels live in community-groups.ts,
// but Story 5.3 uses a dedicated file consistent with the Story 5.1 pattern.
import { boolean, index, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";
import { communityGroups } from "./community-groups";

export const communityGroupChannels = pgTable(
  "community_group_channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => communityGroups.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    isDefault: boolean("is_default").notNull().default(false),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_community_group_channels_group_id").on(t.groupId)],
);

export type CommunityGroupChannel = typeof communityGroupChannels.$inferSelect;
export type NewCommunityGroupChannel = typeof communityGroupChannels.$inferInsert;
