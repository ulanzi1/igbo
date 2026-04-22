// @vitest-environment node
import { describe, it, expect, expectTypeOf } from "vitest";
import type {
  EventMap,
  EventName,
  ContentFlaggedEvent,
  ContentUnflaggedEvent,
  PortalMessageSentEvent,
  PortalMessageEditedEvent,
  PortalMessageDeletedEvent,
} from "./events";

describe("Event type definitions", () => {
  it("defines all required event names as string literals", () => {
    const eventNames: EventName[] = [
      "user.created",
      "post.published",
      "chat.message.sent",
      "points.awarded",
      "member.banned",
      "member.approved",
      "member.followed",
      "member.unfollowed",
      "member.anonymizing",
      "member.anonymized",
      "post.reacted",
      "post.commented",
      "article.submitted",
      "article.published",
      "article.commented",
      "chat.message.mentioned",
      "group.archived",
      "event.attended",
      "event.rsvp",
      "event.rsvp_cancelled",
      "event.waitlist_promoted",
      "recording.expired",
      "job.failed",
    ];

    expect(eventNames).toHaveLength(23);
  });

  it("requires timestamp on all event payloads", () => {
    type AllPayloads = EventMap[EventName];
    expectTypeOf<AllPayloads>().toHaveProperty("timestamp");
  });

  it("exports EventMap type mapping event names to payload types", () => {
    expectTypeOf<EventMap>().toBeObject();
    expectTypeOf<EventMap["user.created"]>().toHaveProperty("userId");
    expectTypeOf<EventMap["post.published"]>().toHaveProperty("postId");
    expectTypeOf<EventMap["post.published"]>().toHaveProperty("authorId");
    expectTypeOf<EventMap["chat.message.sent"]>().toHaveProperty("messageId");
    expectTypeOf<EventMap["points.awarded"]>().toHaveProperty("userId");
    expectTypeOf<EventMap["points.awarded"]>().toHaveProperty("points");
    expectTypeOf<EventMap["member.banned"]>().toHaveProperty("userId");
    expectTypeOf<EventMap["job.failed"]>().toHaveProperty("jobName");
    expectTypeOf<EventMap["job.failed"]>().toHaveProperty("error");
  });

  it("defines ContentFlaggedEvent with required moderation fields", () => {
    expectTypeOf<ContentFlaggedEvent>().toHaveProperty("contentType");
    expectTypeOf<ContentFlaggedEvent>().toHaveProperty("contentId");
    expectTypeOf<ContentFlaggedEvent>().toHaveProperty("contentAuthorId");
    expectTypeOf<ContentFlaggedEvent>().toHaveProperty("flagReason");
    expectTypeOf<ContentFlaggedEvent>().toHaveProperty("severity");
    expectTypeOf<ContentFlaggedEvent>().toHaveProperty("moderationActionId");
    expectTypeOf<ContentFlaggedEvent>().toHaveProperty("timestamp");
  });

  it("defines ContentUnflaggedEvent with required moderation fields", () => {
    expectTypeOf<ContentUnflaggedEvent>().toHaveProperty("contentType");
    expectTypeOf<ContentUnflaggedEvent>().toHaveProperty("contentId");
    expectTypeOf<ContentUnflaggedEvent>().toHaveProperty("moderationActionId");
    expectTypeOf<ContentUnflaggedEvent>().toHaveProperty("moderatorId");
    expectTypeOf<ContentUnflaggedEvent>().toHaveProperty("timestamp");
  });

  it("maps content.flagged and content.unflagged in EventMap", () => {
    expectTypeOf<EventMap["content.flagged"]>().toHaveProperty("moderationActionId");
    expectTypeOf<EventMap["content.unflagged"]>().toHaveProperty("moderatorId");
  });

  it("includes content.flagged and content.unflagged in EventName union", () => {
    const flaggedName: EventName = "content.flagged";
    const unflaggedName: EventName = "content.unflagged";
    expect(flaggedName).toBe("content.flagged");
    expect(unflaggedName).toBe("content.unflagged");
  });
});

describe("Portal event type definitions", () => {
  it("defines PortalMessageSentEvent with portal-specific required fields", () => {
    expectTypeOf<PortalMessageSentEvent>().toHaveProperty("messageId");
    expectTypeOf<PortalMessageSentEvent>().toHaveProperty("senderId");
    expectTypeOf<PortalMessageSentEvent>().toHaveProperty("conversationId");
    expectTypeOf<PortalMessageSentEvent>().toHaveProperty("applicationId");
    expectTypeOf<PortalMessageSentEvent>().toHaveProperty("jobId");
    expectTypeOf<PortalMessageSentEvent>().toHaveProperty("companyId");
    expectTypeOf<PortalMessageSentEvent>().toHaveProperty("jobTitle");
    expectTypeOf<PortalMessageSentEvent>().toHaveProperty("companyName");
    expectTypeOf<PortalMessageSentEvent>().toHaveProperty("senderRole");
    expectTypeOf<PortalMessageSentEvent>().toHaveProperty("recipientId");
    expectTypeOf<PortalMessageSentEvent>().toHaveProperty("timestamp");
  });

  it("defines PortalMessageEditedEvent with required fields", () => {
    expectTypeOf<PortalMessageEditedEvent>().toHaveProperty("messageId");
    expectTypeOf<PortalMessageEditedEvent>().toHaveProperty("conversationId");
    expectTypeOf<PortalMessageEditedEvent>().toHaveProperty("applicationId");
    expectTypeOf<PortalMessageEditedEvent>().toHaveProperty("senderId");
    expectTypeOf<PortalMessageEditedEvent>().toHaveProperty("content");
    expectTypeOf<PortalMessageEditedEvent>().toHaveProperty("editedAt");
    expectTypeOf<PortalMessageEditedEvent>().toHaveProperty("timestamp");
  });

  it("defines PortalMessageDeletedEvent with required fields", () => {
    expectTypeOf<PortalMessageDeletedEvent>().toHaveProperty("messageId");
    expectTypeOf<PortalMessageDeletedEvent>().toHaveProperty("conversationId");
    expectTypeOf<PortalMessageDeletedEvent>().toHaveProperty("applicationId");
    expectTypeOf<PortalMessageDeletedEvent>().toHaveProperty("senderId");
    expectTypeOf<PortalMessageDeletedEvent>().toHaveProperty("deletedAt");
    expectTypeOf<PortalMessageDeletedEvent>().toHaveProperty("timestamp");
  });

  it("EventMap['portal.message.sent'] resolves to PortalMessageSentEvent", () => {
    expectTypeOf<EventMap["portal.message.sent"]>().toEqualTypeOf<PortalMessageSentEvent>();
  });

  it("EventMap['portal.message.edited'] resolves to PortalMessageEditedEvent", () => {
    expectTypeOf<EventMap["portal.message.edited"]>().toEqualTypeOf<PortalMessageEditedEvent>();
  });

  it("EventMap['portal.message.deleted'] resolves to PortalMessageDeletedEvent", () => {
    expectTypeOf<EventMap["portal.message.deleted"]>().toEqualTypeOf<PortalMessageDeletedEvent>();
  });

  it("EventMap['chat.message.sent'] still resolves to MessageSentEvent (not broken)", () => {
    expectTypeOf<EventMap["chat.message.sent"]>().toHaveProperty("messageId");
    expectTypeOf<EventMap["chat.message.sent"]>().toHaveProperty("senderId");
    expectTypeOf<EventMap["chat.message.sent"]>().toHaveProperty("conversationId");
    // chat.message.sent does NOT have applicationId (that's portal-only)
    expectTypeOf<EventMap["chat.message.sent"]>().not.toHaveProperty("applicationId");
  });

  it("portal event names are valid EventName values", () => {
    const sentName: EventName = "portal.message.sent";
    const editedName: EventName = "portal.message.edited";
    const deletedName: EventName = "portal.message.deleted";
    expect(sentName).toBe("portal.message.sent");
    expect(editedName).toBe("portal.message.edited");
    expect(deletedName).toBe("portal.message.deleted");
  });
});
