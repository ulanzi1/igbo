import { pgTable, pgEnum, uuid, varchar, text, integer, timestamp } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";
import { communityGroups } from "./community-groups";

export const eventTypeEnum = pgEnum("community_event_type", ["general", "group"]);
export const eventFormatEnum = pgEnum("community_event_format", ["virtual", "in_person", "hybrid"]);
export const eventStatusEnum = pgEnum("community_event_status", [
  "upcoming",
  "live",
  "completed",
  "cancelled",
]);
export const attendeeStatusEnum = pgEnum("community_event_attendee_status", [
  "registered",
  "waitlisted",
  "attended",
  "cancelled",
]);
export const recurrencePatternEnum = pgEnum("community_event_recurrence", [
  "none",
  "daily",
  "weekly",
  "monthly",
]);

export const communityEvents = pgTable("community_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  creatorId: uuid("creator_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  groupId: uuid("group_id").references(() => communityGroups.id, { onDelete: "cascade" }),
  eventType: eventTypeEnum("event_type").notNull().default("general"),
  format: eventFormatEnum("format").notNull().default("virtual"),
  location: text("location"),
  meetingLink: text("meeting_link"),
  timezone: varchar("timezone", { length: 50 }).notNull().default("UTC"),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }).notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  registrationLimit: integer("registration_limit"),
  attendeeCount: integer("attendee_count").notNull().default(0),
  recurrencePattern: recurrencePatternEnum("recurrence_pattern").notNull().default("none"),
  recurrenceParentId: uuid("recurrence_parent_id"), // self-reference — no .references() to avoid circular Drizzle issue; enforced via migration FK
  status: eventStatusEnum("status").notNull().default("upcoming"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const communityEventAttendees = pgTable("community_event_attendees", {
  eventId: uuid("event_id")
    .notNull()
    .references(() => communityEvents.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  status: attendeeStatusEnum("status").notNull().default("registered"),
  registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
});

// TypeScript types
export type EventType = (typeof eventTypeEnum.enumValues)[number];
export type EventFormat = (typeof eventFormatEnum.enumValues)[number];
export type EventStatus = (typeof eventStatusEnum.enumValues)[number];
export type AttendeeStatus = (typeof attendeeStatusEnum.enumValues)[number];
export type RecurrencePattern = (typeof recurrencePatternEnum.enumValues)[number];
export type CommunityEvent = typeof communityEvents.$inferSelect;
export type NewCommunityEvent = typeof communityEvents.$inferInsert;
export type EventAttendee = typeof communityEventAttendees.$inferSelect;
