import { pgTable, pgEnum, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";
import { platformModerationActions } from "./moderation";

export const disciplineActionTypeEnum = pgEnum("discipline_action_type", [
  "warning",
  "suspension",
  "ban",
]);

export const disciplineSourceTypeEnum = pgEnum("discipline_source_type", [
  "moderation_action",
  "report",
  "manual",
]);

export const disciplineStatusEnum = pgEnum("discipline_status", ["active", "expired", "lifted"]);

export const memberDisciplineActions = pgTable(
  "member_discipline_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    moderationActionId: uuid("moderation_action_id").references(
      () => platformModerationActions.id,
      { onDelete: "set null" },
    ),
    sourceType: disciplineSourceTypeEnum("source_type").notNull(),
    actionType: disciplineActionTypeEnum("action_type").notNull(),
    reason: text("reason").notNull(),
    notes: text("notes"),
    suspensionEndsAt: timestamp("suspension_ends_at", { withTimezone: true }),
    issuedBy: uuid("issued_by")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    status: disciplineStatusEnum("status").notNull().default("active"),
    liftedAt: timestamp("lifted_at", { withTimezone: true }),
    liftedBy: uuid("lifted_by").references(() => authUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_member_discipline_user_id").on(t.userId),
    index("idx_member_discipline_status").on(t.status),
    index("idx_member_discipline_suspension_ends_at").on(t.suspensionEndsAt),
  ],
);

export type MemberDisciplineAction = typeof memberDisciplineActions.$inferSelect;
export type NewMemberDisciplineAction = typeof memberDisciplineActions.$inferInsert;
